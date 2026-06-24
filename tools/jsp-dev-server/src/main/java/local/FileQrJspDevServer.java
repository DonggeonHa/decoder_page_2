package local;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.apache.catalina.Context;
import org.apache.catalina.startup.Tomcat;

public class FileQrJspDevServer {
  public static void main(String[] args) throws Exception {
    Path repoRoot = Paths.get(args.length > 0 ? args[0] : ".").toAbsolutePath().normalize();
    Path workDir = Paths.get(args.length > 1 ? args[1] : "target").toAbsolutePath().normalize();
    Path docBase = repoRoot.resolve("artifacts").toAbsolutePath().normalize();
    Path allowedBaseDir = repoRoot.resolve("jsp-test-files").toAbsolutePath().normalize();

    Files.createDirectories(workDir);
    Files.createDirectories(allowedBaseDir);
    createSampleFile(allowedBaseDir);

    if (System.getProperty("fileQr.baseDir") == null) {
      System.setProperty("fileQr.baseDir", allowedBaseDir.toString());
    }

    int port = Integer.parseInt(System.getProperty("jsp.port", System.getenv().getOrDefault("JSP_PORT", "8080")));
    Tomcat tomcat = new Tomcat();
    tomcat.setPort(port);
    tomcat.setBaseDir(workDir.resolve("tomcat").toString());
    tomcat.getConnector();

    Context context = tomcat.addWebapp("", docBase.toString());
    context.setParentClassLoader(Thread.currentThread().getContextClassLoader());

    tomcat.start();

    System.out.println("FILE QR JSP sender running at http://127.0.0.1:" + port + "/file-qr-sender.jsp");
    System.out.println("Allowed file base directory: " + System.getProperty("fileQr.baseDir"));
    System.out.println("Sample file: " + allowedBaseDir.resolve("sample.txt"));

    tomcat.getServer().await();
  }

  private static void createSampleFile(Path allowedBaseDir) throws Exception {
    Path sample = allowedBaseDir.resolve("sample.txt");
    if (!Files.exists(sample)) {
      Files.write(sample, "FILE QR JSP local test\n한국어 샘플\n".getBytes("UTF-8"));
    }
  }
}
