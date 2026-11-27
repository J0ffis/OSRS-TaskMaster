import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * OSRS TaskMaster local server. No dependencies: run with `java Server.java` (JDK 17+, for HexFormat).
 * Usually started by scripts/Start-LocalServer.ps1. Options: -Droot=<server folder> (where data/
 * is kept) and -Dport=<port> (default 8787).
 *
 *   POST /api/sync              snapshot from the RuneLite plugin (needs X-TaskMaster-Token)
 *   GET  /api/profiles          names with a stored snapshot
 *   GET  /api/profile/{name}    latest snapshot for a player
 *   GET  /api/goals/{name}      saved goals
 *   PUT  /api/goals/{name}      replace saved goals
 *   GET  /*                     static site from ../web
 *
 * Listens on 127.0.0.1 only, so nothing outside this PC can reach it.
 */
public class Server
{
	private static final int PORT = Integer.parseInt(System.getProperty("port", "8787"));
	private static final int MAX_BODY = 8 * 1024 * 1024;
	private static final Pattern NAME_IN_SNAPSHOT = Pattern.compile("\"player\"\\s*:\\s*\\{\\s*\"name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.){1,40})\"");
	private static final Map<String, String> TYPES = Map.of(
		"html", "text/html; charset=utf-8", "js", "text/javascript; charset=utf-8",
		"css", "text/css; charset=utf-8", "json", "application/json; charset=utf-8",
		"svg", "image/svg+xml", "png", "image/png", "ico", "image/x-icon");

	private static Path root;
	private static Path web;
	private static Path profiles;
	private static Path goals;
	private static String token;

	public static void main(String[] args) throws Exception
	{
		root = Paths.get(System.getProperty("root", ".")).toAbsolutePath().normalize();
		web = root.resolve("../web").normalize();
		Path data = root.resolve("data");
		profiles = Files.createDirectories(data.resolve("profiles"));
		goals = Files.createDirectories(data.resolve("goals"));
		Path tokenFile = data.resolve("token.txt");
		if (!Files.exists(tokenFile))
		{
			byte[] b = new byte[16];
			new SecureRandom().nextBytes(b);
			Files.writeString(tokenFile, HexFormat.of().formatHex(b));
		}
		token = Files.readString(tokenFile).trim();

		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", PORT), 0);
		server.createContext("/", Server::handle);
		server.setExecutor(Executors.newFixedThreadPool(4));
		server.start();
		System.out.println("OSRS TaskMaster running at http://localhost:" + PORT);
		System.out.println("Plugin sync token (paste into RuneLite > OSRS TaskMaster > Sync token): " + token);
	}

	private static void handle(HttpExchange ex) throws IOException
	{
		try
		{
			// Block DNS-rebinding: only answer requests addressed to this machine by name.
			String host = String.valueOf(ex.getRequestHeaders().getFirst("Host")).replaceAll(":\\d+$", "");
			if (!host.equals("localhost") && !host.equals("127.0.0.1"))
			{
				send(ex, 403, "text/plain", "Forbidden host");
				return;
			}
			String path = ex.getRequestURI().getPath();
			String method = ex.getRequestMethod();
			if (path.equals("/api/sync") && method.equals("POST"))
			{
				sync(ex);
			}
			else if (path.equals("/api/profiles") && method.equals("GET"))
			{
				listProfiles(ex);
			}
			else if (path.startsWith("/api/profile/") && method.equals("GET"))
			{
				serveFile(ex, profiles.resolve(fileName(path.substring(13)) + ".json"), "No synced data for that player yet.");
			}
			else if (path.startsWith("/api/goals/"))
			{
				Path f = goals.resolve(fileName(path.substring(11)) + ".json");
				if (method.equals("GET"))
				{
					if (Files.exists(f)) serveFile(ex, f, null);
					else send(ex, 200, TYPES.get("json"), "[]");
				}
				else if (method.equals("PUT"))
				{
					String body = readBody(ex);
					if (!body.trim().startsWith("["))
					{
						send(ex, 400, "text/plain", "Goals must be a JSON array");
						return;
					}
					Files.writeString(f, body);
					send(ex, 204, null, null);
				}
				else send(ex, 405, "text/plain", "Method not allowed");
			}
			else if (path.startsWith("/api/"))
			{
				send(ex, 404, "text/plain", "Not found");
			}
			else
			{
				staticFile(ex, path);
			}
		}
		catch (IllegalArgumentException e)
		{
			send(ex, 400, "text/plain", e.getMessage());
		}
		catch (Exception e)
		{
			e.printStackTrace();
			send(ex, 500, "text/plain", "Server error");
		}
	}

	private static void sync(HttpExchange ex) throws IOException
	{
		String got = String.valueOf(ex.getRequestHeaders().getFirst("X-TaskMaster-Token")).replaceAll("[^0-9A-Za-z]", "");
		if (!token.equals(got))
		{
			System.out.println("Rejected sync: " + (got.isEmpty() || got.equals("null")
				? "no token was sent (plugin's Sync token setting is empty)"
				: "token mismatch (received " + got.length() + " characters, expected " + token.length() + ")"));
			send(ex, 401, "text/plain", "Bad token");
			return;
		}
		String body = readBody(ex);
		Matcher m = NAME_IN_SNAPSHOT.matcher(body);
		if (!m.find())
		{
			send(ex, 400, "text/plain", "Snapshot has no player name");
			return;
		}
		// Wealth is deliberately not stored, even if an older plugin build sends it.
		if (body.contains("\"wealth\":"))
		{
			System.out.println("Rejected sync: it contains wealth data. Update the RuneLite plugin.");
			send(ex, 400, "text/plain", "Wealth data is not accepted; update the plugin");
			return;
		}
		String name = m.group(1);
		Files.writeString(profiles.resolve(fileName(name) + ".json"), body);
		System.out.println("Synced " + name + " (" + body.length() / 1024 + " KB)");
		send(ex, 204, null, null);
	}

	private static void listProfiles(HttpExchange ex) throws IOException
	{
		try (Stream<Path> s = Files.list(profiles))
		{
			String json = s.map(p -> p.getFileName().toString())
				.filter(n -> n.endsWith(".json"))
				.map(n -> "\"" + n.substring(0, n.length() - 5) + "\"")
				.collect(Collectors.joining(",", "[", "]"));
			send(ex, 200, TYPES.get("json"), json);
		}
	}

	/** OSRS names are 1-12 chars of letters, digits, spaces, '-' and '_'. Spaces and '_' are equivalent in-game. */
	static String fileName(String raw)
	{
		String n = URLDecoder.decode(raw, StandardCharsets.UTF_8).toLowerCase()
			.replace((char) 160, ' ').trim().replaceAll("[ _]+", "_");
		if (!n.matches("[a-z0-9_-]{1,12}"))
		{
			throw new IllegalArgumentException("Invalid player name");
		}
		return n;
	}

	private static void staticFile(HttpExchange ex, String path) throws IOException
	{
		if (path.equals("/")) path = "/index.html";
		Path f = web.resolve(path.substring(1)).normalize();
		if (!f.startsWith(web) || !Files.isRegularFile(f))
		{
			send(ex, 404, "text/plain", "Not found");
			return;
		}
		serveFile(ex, f, null);
	}

	private static void serveFile(HttpExchange ex, Path f, String missing) throws IOException
	{
		if (!Files.isRegularFile(f))
		{
			send(ex, 404, "text/plain", missing == null ? "Not found" : missing);
			return;
		}
		String name = f.getFileName().toString();
		String ext = name.substring(name.lastIndexOf('.') + 1);
		ex.getResponseHeaders().set("Cache-Control", "no-store");
		sendBytes(ex, 200, TYPES.getOrDefault(ext, "application/octet-stream"), Files.readAllBytes(f));
	}

	private static String readBody(HttpExchange ex) throws IOException
	{
		try (InputStream in = ex.getRequestBody())
		{
			byte[] b = in.readNBytes(MAX_BODY + 1);
			if (b.length > MAX_BODY) throw new IllegalArgumentException("Body too large");
			return new String(b, StandardCharsets.UTF_8);
		}
	}

	private static void send(HttpExchange ex, int code, String type, String body) throws IOException
	{
		sendBytes(ex, code, type, body == null ? null : body.getBytes(StandardCharsets.UTF_8));
	}

	private static void sendBytes(HttpExchange ex, int code, String type, byte[] body) throws IOException
	{
		ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
		if (type != null) ex.getResponseHeaders().set("Content-Type", type);
		if (body == null || ex.getRequestMethod().equals("HEAD"))
		{
			ex.sendResponseHeaders(code, -1);
		}
		else
		{
			ex.sendResponseHeaders(code, body.length);
			try (OutputStream os = ex.getResponseBody())
			{
				os.write(body);
			}
		}
		ex.close();
	}
}
