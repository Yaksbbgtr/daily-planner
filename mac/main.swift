// Copies Apple Calendar events into Luach's secret gist so the web app can show them.
// Reads only: it never changes a calendar. Uses the `gh` command line tool to sign in.
import EventKit
import Foundation

let args = CommandLine.arguments
let marker = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Luach/last.json")
let fileName = "luach-apple.json"

func stop(_ msg: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((msg + "\n").utf8))
    exit(code)
}

func gh(_ arguments: [String], input: Data? = nil) -> Data {
    let candidates = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"]
    guard let path = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else { stop("The gh command line tool is not installed.") }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: path)
    p.arguments = arguments
    let out = Pipe(), inp = Pipe()
    p.standardOutput = out
    p.standardInput = inp
    do { try p.run() } catch { stop("Could not run gh: \(error)") }
    // Write from another thread: a large body would otherwise block against a full output pipe.
    DispatchQueue.global().async {
        if let input { try? inp.fileHandleForWriting.write(contentsOf: input) }
        try? inp.fileHandleForWriting.close()
    }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    if p.terminationStatus != 0 { stop("gh failed: \(String(decoding: data, as: UTF8.self))") }
    return data
}

func hex(_ c: CGColor?) -> String {
    guard let s = c?.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components, s.count >= 3 else { return "#6b7280" }
    return String(format: "#%02x%02x%02x", Int((s[0] * 255).rounded()), Int((s[1] * 255).rounded()), Int((s[2] * 255).rounded()))
}

let store = EKEventStore()
let wait = DispatchSemaphore(value: 0)
nonisolated(unsafe) var granted = false
store.requestFullAccessToEvents { ok, _ in granted = ok; wait.signal() }
wait.wait()
guard granted else { stop("Calendar access is off. Turn it on in System Settings > Privacy & Security > Calendars > Luach Calendar.", 2) }

let cal = Calendar.current
let today = cal.startOfDay(for: Date())
let from = cal.date(byAdding: .day, value: -31, to: today)!
let to = cal.date(byAdding: .day, value: 366, to: today)!
let days = DateFormatter()
days.locale = Locale(identifier: "en_US_POSIX")
days.calendar = Calendar(identifier: .gregorian)
days.dateFormat = "yyyy-MM-dd"

var events: [[String: Any]] = []
for e in store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil)) {
    guard let start = e.startDate, let end = e.endDate, e.status != .canceled else { continue }
    var row: [String: Any] = [
        "id": "\(e.calendarItemIdentifier)-\(Int(start.timeIntervalSince1970))",
        "t": e.title ?? "Untitled", "cal": e.calendar?.title ?? "Calendar", "color": hex(e.calendar?.cgColor),
    ]
    if let loc = e.location, !loc.isEmpty { row["loc"] = String(loc.prefix(200)) }
    if e.isAllDay {
        row["day"] = days.string(from: start)
        row["endDay"] = days.string(from: max(start, end.addingTimeInterval(-1)))
    } else {
        row["s"] = Int(start.timeIntervalSince1970)
        row["e"] = Int(end.timeIntervalSince1970)
    }
    events.append(row)
}
events.sort { ($0["id"] as! String) < ($1["id"] as! String) }

let body = try JSONSerialization.data(withJSONObject: events, options: [.sortedKeys])
if args.contains("--dry-run") {
    print("\(events.count) events, \(body.count) bytes. Nothing was uploaded.")
    exit(0)
}
if let last = try? Data(contentsOf: marker), last == body { print("No changes."); exit(0) }

// The app makes the gist on its first sync; until then there is nowhere to put this.
let ids = String(decoding: gh(["api", "--paginate", "/gists?per_page=100", "--jq", ".[] | select(.public == false) | select(.files[\"luach-sync.json\"]) | .id"]), as: UTF8.self).split(separator: "\n")
guard let id = ids.first else { stop("Connect sync in Luach's settings first, then run this again.", 3) }

let payload: [String: Any] = ["v": 1, "updated": ISO8601DateFormatter().string(from: Date()), "events": events]
let content = String(decoding: try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), as: UTF8.self)
let patch = try JSONSerialization.data(withJSONObject: ["files": [fileName: ["content": content]]])
_ = gh(["api", "--method", "PATCH", "/gists/\(id)", "--input", "-", "--silent"], input: patch)
try? FileManager.default.createDirectory(at: marker.deletingLastPathComponent(), withIntermediateDirectories: true)
try? body.write(to: marker)
print("Uploaded \(events.count) events.")
