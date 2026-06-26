import AppKit
import Foundation
import WebKit

final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    private let resourceRoot: URL
    private let eventsURL: URL

    override init() {
        self.resourceRoot = Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)

        let supportRoot = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let appSupport = supportRoot.appendingPathComponent("Memo Day", isDirectory: true)
        try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true)
        self.eventsURL = appSupport.appendingPathComponent("events.json")

        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request
        guard let url = request.url else {
            respond(urlSchemeTask, data: Data(), mimeType: "text/plain", status: 400)
            return
        }

        if url.path == "/api/events" {
            handleEvents(request, task: urlSchemeTask)
            return
        }

        serveResource(url, task: urlSchemeTask)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func handleEvents(_ request: URLRequest, task: WKURLSchemeTask) {
        if request.httpMethod == "POST" {
            let body = requestBodyData(request) ?? Data("[]".utf8)
            do {
                _ = try JSONSerialization.jsonObject(with: body)
                try body.write(to: eventsURL, options: .atomic)
                respond(task, data: Data("{\"ok\":true}".utf8), mimeType: "application/json")
            } catch {
                respond(task, data: Data("{\"error\":\"Invalid events\"}".utf8), mimeType: "application/json", status: 400)
            }
            return
        }

        let data = (try? Data(contentsOf: eventsURL)) ?? Data("[]".utf8)
        respond(task, data: data, mimeType: "application/json")
    }

    private func serveResource(_ url: URL, task: WKURLSchemeTask) {
        let path = url.path == "/" ? "/index.html" : url.path
        let cleanedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let fileURL = resourceRoot.appendingPathComponent(cleanedPath)

        guard fileURL.path.hasPrefix(resourceRoot.path),
              let data = try? Data(contentsOf: fileURL) else {
            respond(task, data: Data("Not found".utf8), mimeType: "text/plain", status: 404)
            return
        }

        respond(task, data: data, mimeType: mimeType(for: fileURL.pathExtension))
    }

    private func requestBodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }

        guard let stream = request.httpBodyStream else {
            return nil
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        let bufferSize = 4096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read > 0 {
                data.append(buffer, count: read)
            } else {
                break
            }
        }

        return data
    }

    private func respond(_ task: WKURLSchemeTask, data: Data, mimeType: String, status: Int = 200) {
        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "\(mimeType); charset=utf-8",
                "Cache-Control": "no-store"
            ]
        )!

        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func mimeType(for fileExtension: String) -> String {
        switch fileExtension {
        case "html": return "text/html"
        case "css": return "text/css"
        case "js": return "text/javascript"
        case "svg": return "image/svg+xml"
        case "json": return "application/json"
        default: return "application/octet-stream"
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private let schemeHandler = LocalSchemeHandler()
    private let appURL = URL(string: "memoday://app/index.html")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildMenu()
        buildWindow()
        webView?.load(URLRequest(url: appURL))
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func buildWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "memoday")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        window.title = "Memo Day"
        window.minSize = NSSize(width: 720, height: 560)
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        self.window = window
    }

    private func buildMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "退出 Memo Day", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)
        NSApp.mainMenu = mainMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
