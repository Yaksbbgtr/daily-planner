// Sends Apple Calendar events to Daily Planner so the app can show them on every device.
// Reads only: it never changes a calendar.
import EventKit
import Foundation

let args = CommandLine.arguments
let marker = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Daily Planner/last.json")

func stop(_ msg: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((msg + "\n").utf8))
    exit(code)
}

// Settings written into Info.plist by install.sh.
let info = Bundle.main.infoDictionary ?? [:]
guard let base = info["PlannerURL"] as? String, let apiKey = info["PlannerKey"] as? String, !base.isEmpty else { stop("Run install.sh again: the app was built without the sync settings.") }

func macKey() -> String {
    let p = Process(), out = Pipe()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    p.arguments = ["find-generic-password", "-s", "Daily Planner Mac key", "-w"]
    p.standardOutput = out
    p.standardError = Pipe()
    try? p.run()
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    let key = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    if p.terminationStatus != 0 || key.isEmpty { stop("No Mac key saved. Run install.sh again and paste the key from the app's settings.") }
    return key
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
guard granted else { stop("Calendar access is off. Turn it on in System Settings > Privacy & Security > Calendars > Daily Planner Calendar.", 2) }

let cal = Calendar.current
let today = cal.startOfDay(for: Date())
let from = cal.date(byAdding: .day, value: -31, to: today)!
let to = cal.date(byAdding: .day, value: 366, to: today)!
let days = DateFormatter()
days.locale = Locale(identifier: "en_US_POSIX")
days.calendar = Calendar(identifier: .gregorian)
days.dateFormat = "yyyy-MM-dd"

// Links from the event's URL field, then any found in its location and notes (Zoom, Meet, Teams...).
let finder = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
func links(_ e: EKEvent) -> [String] {
    var out: [String] = []
    func add(_ u: URL?) {
        guard let u, let scheme = u.scheme?.lowercased(), ["http", "https"].contains(scheme) else { return }
        let s = u.absoluteString
        if s.count <= 1000, !out.contains(s), out.count < 5 { out.append(s) }
    }
    add(e.url)
    for text in [e.location, e.notes].compactMap({ $0 }) where !text.isEmpty {
        let r = NSRange(text.startIndex..., in: text)
        for m in finder?.matches(in: text, options: [], range: r) ?? [] { add(m.url) }
    }
    return out
}

var events: [[String: Any]] = []
for e in store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil)) {
    guard let start = e.startDate, let end = e.endDate, e.status != .canceled else { continue }
    var row: [String: Any] = [
        "id": "\(e.calendarItemIdentifier)-\(Int(start.timeIntervalSince1970))",
        "t": e.title ?? "Untitled", "cal": e.calendar?.title ?? "Calendar", "color": hex(e.calendar?.cgColor),
    ]
    if let loc = e.location, !loc.isEmpty { row["loc"] = String(loc.prefix(200)) }
    let found = links(e)
    if !found.isEmpty { row["links"] = found }
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

let payload: [String: Any] = ["key": macKey(), "data": ["v": 1, "events": events]]
var req = URLRequest(url: URL(string: base + "/rest/v1/rpc/put_apple")!)
req.httpMethod = "POST"
req.setValue(apiKey, forHTTPHeaderField: "apikey")
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.httpBody = try JSONSerialization.data(withJSONObject: payload)
let done = DispatchSemaphore(value: 0)
nonisolated(unsafe) var failure: String? = nil
URLSession.shared.dataTask(with: req) { body, res, err in
    let code = (res as? HTTPURLResponse)?.statusCode ?? 0
    if let err { failure = "Could not reach the planner: \(err.localizedDescription)" }
    else if !(200..<300).contains(code) {
        let msg = String(decoding: body ?? Data(), as: UTF8.self)
        failure = msg.contains("unknown key") ? "The Mac key was not accepted. Make a new one in the app's settings and run install.sh again." : "Upload failed (\(code)): \(msg)"
    }
    done.signal()
}.resume()
done.wait()
if let failure { stop(failure) }
try? FileManager.default.createDirectory(at: marker.deletingLastPathComponent(), withIntermediateDirectories: true)
try? body.write(to: marker)
print("Uploaded \(events.count) events.")
