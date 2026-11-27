<#
  Rewrites JSON so people can read it. Values are copied exactly as written; only the spacing changes.

    .\scripts\Format-Json.ps1 web\samples\index.json      # format a file in place

  Layout:
    - Objects and arrays that hold other objects or arrays get one entry per line, indented 2 spaces.
    - Short objects and arrays of plain values stay on one line:  {"level": 80, "xp": 1986068}, [1, 2, 3]
      Longer ones (over 100 characters) get one entry per line.

  Other scripts can dot-source this file and call Format-JsonText on a string.
#>
param(
  [string[]]$Path
)

if (-not ('TaskMaster.JsonFormatter' -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @'
using System.Collections.Generic;
using System.Text;

namespace TaskMaster
{
    public static class JsonFormatter
    {
        // Objects and arrays of plain values longer than this are split over several lines.
        const int MaxInline = 100;

        class Node
        {
            public string Literal;          // set for plain values (string, number, true, false, null)
            public bool IsObject;
            public List<string> Keys = new List<string>();
            public List<Node> Items = new List<Node>();
        }

        public static string Format(string json)
        {
            int i = 0;
            Node root = Parse(json, ref i);
            SkipSpace(json, ref i);
            if (i != json.Length) throw new System.FormatException("Unexpected text after the JSON value at position " + i);
            var sb = new StringBuilder();
            Write(root, sb, 0);
            sb.Append('\n');
            return sb.ToString();
        }

        static void SkipSpace(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        // Windows PowerShell writes ' & < > as ' & < >; turn those back into the
        // plain characters, which mean exactly the same in JSON.
        static readonly Dictionary<string, char> Unescape = new Dictionary<string, char>
        {
            { "u0027", '\'' }, { "u0026", '&' }, { "u003c", '<' }, { "u003e", '>' },
        };

        static string ReadString(string s, ref int i)
        {
            var sb = new StringBuilder();
            sb.Append(s[i++]);
            while (s[i] != '"')
            {
                if (s[i] == '\\')
                {
                    char plain;
                    if (i + 6 <= s.Length && Unescape.TryGetValue(s.Substring(i + 1, 5).ToLowerInvariant(), out plain))
                    {
                        sb.Append(plain);
                        i += 6;
                        continue;
                    }
                    sb.Append(s[i++]);
                }
                sb.Append(s[i++]);
            }
            sb.Append(s[i++]);
            return sb.ToString();
        }

        static Node Parse(string s, ref int i)
        {
            SkipSpace(s, ref i);
            char c = s[i];
            if (c == '{' || c == '[')
            {
                var node = new Node { IsObject = c == '{' };
                char close = node.IsObject ? '}' : ']';
                i++;
                SkipSpace(s, ref i);
                if (s[i] == close) { i++; return node; }
                while (true)
                {
                    SkipSpace(s, ref i);
                    if (node.IsObject)
                    {
                        node.Keys.Add(ReadString(s, ref i));
                        SkipSpace(s, ref i);
                        if (s[i] != ':') throw new System.FormatException("Expected ':' at position " + i);
                        i++;
                    }
                    node.Items.Add(Parse(s, ref i));
                    SkipSpace(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == close) { i++; return node; }
                    throw new System.FormatException("Expected ',' or '" + close + "' at position " + i);
                }
            }
            if (c == '"') return new Node { Literal = ReadString(s, ref i) };
            int from = i;
            while (i < s.Length && ",}] \t\r\n".IndexOf(s[i]) < 0) i++;
            return new Node { Literal = s.Substring(from, i - from) };
        }

        static bool AllPlain(Node n)
        {
            foreach (var item in n.Items) if (item.Literal == null) return false;
            return true;
        }

        static string Inline(Node n)
        {
            if (n.Literal != null) return n.Literal;
            var parts = new List<string>();
            for (int k = 0; k < n.Items.Count; k++)
                parts.Add((n.IsObject ? n.Keys[k] + ": " : "") + Inline(n.Items[k]));
            return n.IsObject ? "{" + string.Join(", ", parts) + "}" : "[" + string.Join(", ", parts) + "]";
        }

        static void Write(Node n, StringBuilder sb, int depth)
        {
            if (n.Literal != null || n.Items.Count == 0 || (AllPlain(n) && Inline(n).Length <= MaxInline))
            {
                sb.Append(Inline(n));
                return;
            }
            string pad = new string(' ', (depth + 1) * 2);
            sb.Append(n.IsObject ? "{\n" : "[\n");
            for (int k = 0; k < n.Items.Count; k++)
            {
                sb.Append(pad);
                if (n.IsObject) sb.Append(n.Keys[k]).Append(": ");
                Write(n.Items[k], sb, depth + 1);
                if (k < n.Items.Count - 1) sb.Append(',');
                sb.Append('\n');
            }
            sb.Append(new string(' ', depth * 2)).Append(n.IsObject ? '}' : ']');
        }
    }
}
'@
}

function Format-JsonText([string]$Json) {
  [TaskMaster.JsonFormatter]::Format($Json)
}

foreach ($p in $Path) {
  $full = (Resolve-Path $p).Path
  $text = [IO.File]::ReadAllText($full)
  [IO.File]::WriteAllText($full, (Format-JsonText $text), (New-Object Text.UTF8Encoding($false)))
  Write-Host "Formatted $p"
}
