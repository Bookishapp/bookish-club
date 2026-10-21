import Foundation

struct TestFailure: Error, CustomStringConvertible {
    let description: String
}

func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try condition() == false { throw TestFailure(description: message) }
}

func expectThrows(_ body: () throws -> Void, _ message: String) throws {
    do {
        try body()
    } catch {
        return
    }
    throw TestFailure(description: message)
}

let firstTime = Date(timeIntervalSince1970: 1_780_000_000)
let nextTime = Date(timeIntervalSince1970: 1_780_000_100)

// Create untrusted transport fixtures independently of messageURL validation.
func untrustedURL(_ state: MessageState, edit: (inout [String: Any]) -> Void) throws -> URL {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    let data = try encoder.encode(state)
    var object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    edit(&object)
    let bytes = try JSONSerialization.data(withJSONObject: object)
    let payload = bytes.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    return URL(string: "https://meetbookish.com/imessage/v1#payload=" + payload)!
}

let tests: [(String, () throws -> Void)] = [
    ("pending selected draft preserves the last committed snapshot", {
        var committed = MessageState.sample(kind: .rsvp)
        try committed.respond(participantID: "local", name: "Reader", rsvp: .yes, now: firstTime)
        var pending = committed
        try pending.respond(participantID: "local", name: "Reader", rsvp: .cant, now: nextTime)
        try pending.respond(participantID: "remote", name: "Ari", rsvp: .maybe, now: nextTime)
        let baseline = CardSelection.committedState(selected: pending, isPending: true, known: committed, localParticipantID: "local")
        try expect(baseline == committed, "An unsent local draft replaced committed responses")
    }),
    ("a cold pending draft removes only the local unsent response", {
        var pending = MessageState.sample(kind: .rsvp)
        try pending.respond(participantID: "local", name: "Reader", rsvp: .cant, now: nextTime)
        try pending.respond(participantID: "remote", name: "Ari", rsvp: .yes, now: firstTime)
        let baseline = CardSelection.committedState(selected: pending, isPending: true, known: nil, localParticipantID: "local")
        try expect(baseline.cardID == pending.cardID && baseline.clubName == pending.clubName, "Pending baseline lost card metadata")
        try expect(baseline.responses.map { $0.participantID } == ["remote"], "Cold pending baseline adopted the local unsent response or lost another member")
    }),
    ("a committed selected card merges latest known member responses", {
        var known = MessageState.sample(kind: .rsvp)
        try known.respond(participantID: "a", name: "Ari", rsvp: .yes, now: firstTime)
        var selected = known
        selected.responses = []
        try selected.respond(participantID: "b", name: "Bea", rsvp: .maybe, now: nextTime)
        let baseline = CardSelection.committedState(selected: selected, isPending: false, known: known, localParticipantID: "local")
        try expect(baseline.responses.map { $0.participantID } == ["a", "b"], "Committed selection lost known or selected responses")
    }),
    ("all card types round trip without invented members", {
        for kind in CardKind.allCases {
            let state = MessageState.sample(kind: kind)
            try expect(state.responses.isEmpty, "Samples must have no fabricated participants")
            let url = try state.messageURL()
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            try expect(components.scheme == "https", "Messages requires a supported URL scheme")
            try expect(components.host == "meetbookish.com" && components.path == "/imessage/v1", "Wrong route")
            try expect(components.query == nil && components.fragment?.hasPrefix("payload=") == true, "Private state must remain in the URL fragment")
            try expect(url.absoluteString.count <= 5_000, "Messages URL exceeds Apple's limit")
            try expect(try MessageState.decode(url: url) == state, "State changed in URL round trip")
        }
    }),
    ("responses replace only their own participant and normalize names", {
        var state = MessageState.sample(kind: .rsvp)
        try state.respond(participantID: "a", name: "  ", rsvp: .yes, now: firstTime)
        try state.respond(participantID: "b", name: " Zara ", rsvp: .maybe, now: firstTime)
        try state.respond(participantID: "a", name: " Ari ", rsvp: .cant, now: nextTime)
        try expect(state.responses.map { $0.name } == ["Ari", "Zara"], "Names or neutral order were lost")
        try expect(state.responses.count == 2, "Responding twice must not duplicate a participant")
        try expect(state.responses[0].rsvp == .cant, "Latest RSVP did not replace the prior RSVP")
        try expect(state.responses[1].rsvp == .maybe, "Another participant's RSVP changed")
        var blankName = MessageState.sample(kind: .rsvp)
        try blankName.respond(participantID: "blank", name: "\n  ", rsvp: .yes, now: firstTime)
        try expect(blankName.responses[0].name == "Reader", "Blank display names need a neutral fallback")
        let restored = try MessageState.decode(url: state.messageURL())
        try expect(restored == state, "Responses changed in round trip")
    }),
    ("two and three candidate votes accept only a current candidate", {
        for count in [2, 3] {
            var state = MessageState.sample(kind: .vote)
            state.candidates = Array(state.candidates.prefix(count))
            try state.respond(participantID: "voter", name: "Reader", voteID: state.candidates[0].id, now: firstTime)
            try expect(state.responses[0].voteID == state.candidates[0].id, "Valid vote was lost")
            let before = state
            try expectThrows({ try state.respond(participantID: "voter", name: "Reader", voteID: "unknown", now: nextTime) }, "Unknown vote was accepted")
            try expect(state == before, "A rejected response changed state")
        }
    }),
    ("bookmark shelf stays alphabetical regardless of page progress", {
        var state = MessageState.sample(kind: .bookmarks)
        try state.respond(participantID: "z", name: "Zara", page: 0, now: firstTime)
        try state.respond(participantID: "a", name: "Ari", page: state.totalPages, now: firstTime)
        try expect(state.responses.map { $0.name } == ["Ari", "Zara"], "Shelf was ranked by page")
        try expect(state.responses.map { $0.page! } == [state.totalPages, 0], "Page endpoints were not preserved")
        for page in [-1, state.totalPages + 1] {
            try expectThrows({ try state.respond(participantID: "a", name: "Ari", page: page, now: nextTime) }, "Invalid page was accepted")
        }
        try expect(try MessageState.decode(url: state.messageURL()) == state, "Bookmark state changed in transit")
    }),
    ("merge preserves known members and uses latest response timestamps", {
        var local = MessageState.sample(kind: .bookmarks)
        try local.respond(participantID: "a", name: "Ari", page: 10, now: firstTime)
        try local.respond(participantID: "b", name: "Bea", page: 20, now: nextTime)
        var remote = local
        remote.responses = []
        try remote.respond(participantID: "a", name: "Ari", page: 30, now: nextTime)
        try remote.respond(participantID: "b", name: "Bea", page: 1, now: firstTime)
        try remote.respond(participantID: "c", name: "Cam", page: 5, now: firstTime)
        let merged = local.merging(remote)
        try expect(merged.responses.map { $0.participantID } == ["a", "b", "c"], "Merge dropped a known participant")
        try expect(merged.responses.map { $0.page! } == [30, 20, 5], "Merge did not choose newest per participant")
        try expect(remote.merging(local) == merged, "Merge depends on direction when timestamps differ")
    }),
    ("different cards and changed metadata cannot merge responses", {
        var state = MessageState.sample(kind: .rsvp)
        try state.respond(participantID: "a", name: "Ari", rsvp: .yes, now: firstTime)
        var other = state
        other.cardID = UUID()
        other.responses = []
        try expect(state.merging(other) == state, "A different card merged")
        other.cardID = state.cardID
        other.kind = .vote
        try expect(state.merging(other) == state, "A different card type merged")
        other = state
        other.clubName = "Another club"
        try expect(state.merging(other) == state, "Changed metadata merged")
        other = state
        other.candidates[0].title = "A changed book"
        try expect(state.merging(other) == state, "Changed candidates merged")
    }),
    ("transport rejects malformed routes and payloads", {
        let invalidURLs = [
            "bookish-imessage://card/v1?payload=abc",
            "http://meetbookish.com/imessage/v1#payload=abc",
            "https://wrong.com/imessage/v1#payload=abc",
            "https://meetbookish.com/imessage/v2#payload=abc",
            "https://meetbookish.com/imessage/v1",
            "https://meetbookish.com/imessage/v1#payload=abc&payload=abc",
            "https://meetbookish.com/imessage/v1?other=x#payload=abc",
            "https://meetbookish.com/imessage/v1#payload=%%%%",
            "https://meetbookish.com/imessage/v1#payload=A",
            "https://user@meetbookish.com/imessage/v1#payload=e30",
            "https://meetbookish.com:123/imessage/v1#payload=e30"
        ]
        for value in invalidURLs {
            guard let url = URL(string: value) else { continue }
            try expectThrows({ _ = try MessageState.decode(url: url) }, "Malformed URL was accepted: " + value)
        }
    }),
    ("transport rejects future versions and hostile state fields", {
        let state = MessageState.sample(kind: .vote)
        let invalidMutations: [(inout [String: Any]) -> Void] = [
            { $0["version"] = 2 },
            { $0["version"] = 0 },
            { $0.removeValue(forKey: "version") },
            { $0["clubName"] = String(repeating: "x", count: 500) },
            { $0["totalPages"] = -1 },
            { $0["kind"] = "unknown" },
            { $0["candidates"] = [] },
            { object in
                let first = (object["candidates"] as! [[String: Any]])[0]
                object["candidates"] = [first, first]
            },
            { object in
                var candidate = (object["candidates"] as! [[String: Any]])[0]
                candidate["reason"] = String(repeating: "x", count: 1_000)
                object["candidates"] = [candidate, candidate]
            },
            { object in
                let response: [String: Any] = ["p": "a", "n": "Ari", "v": "unknown", "t": 1_780_000_000_000.0]
                object["responses"] = [response]
            },
            { object in
                let response: [String: Any] = ["p": "a", "n": "Ari", "v": "pride", "t": 1_780_000_000_000.0]
                object["responses"] = [response, response]
            }
        ]
        for edit in invalidMutations {
            let url = try untrustedURL(state, edit: edit)
            try expectThrows({ _ = try MessageState.decode(url: url) }, "Invalid transport state was accepted")
        }
        let oversized = try untrustedURL(state) { $0["unused"] = String(repeating: "x", count: 50_000) }
        try expectThrows({ _ = try MessageState.decode(url: oversized) }, "Oversized payload was accepted")
    }),
    ("member limit rejects a new response without losing existing members", {
        var state = MessageState.sample(kind: .rsvp)
        for number in 0..<40 {
            try state.respond(participantID: "member-\(number)", name: "Reader \(number)", rsvp: .yes, now: firstTime)
        }
        let before = state
        try expectThrows({ try state.respond(participantID: "extra", name: "Extra", rsvp: .maybe, now: nextTime) }, "The 41st member was accepted")
        try expect(state == before, "Rejecting the 41st member lost responses")
        try state.respond(participantID: "member-0", name: "Reader 0", rsvp: .cant, now: nextTime)
        try expect(state.responses.count == 40, "Updating a full card changed member count")
        try expect(try MessageState.decode(url: state.messageURL()) == state, "A full card with short names and identifiers cannot round trip")
    }),
    ("encoding rejects valid member data that exceeds the message URL capacity", {
        var state = MessageState.sample(kind: .rsvp)
        for number in 0..<40 {
            try state.respond(participantID: "reader-with-a-long-stable-identifier-\(number)", name: String(repeating: "A", count: 80), rsvp: .yes, now: firstTime)
        }
        try expectThrows({ _ = try state.messageURL() }, "Oversized valid member data produced a URL Apple would reject")
    }),
    ("merge at the member limit retains known readers and still updates their responses", {
        var local = MessageState.sample(kind: .rsvp)
        for number in 0..<40 {
            try local.respond(participantID: "member-\(number)", name: "Reader \(number)", rsvp: .yes, now: firstTime)
        }
        var remote = local
        remote.responses = []
        try remote.respond(participantID: "member-0", name: "Reader 0", rsvp: .cant, now: nextTime)
        try remote.respond(participantID: "new-member", name: "A new reader", rsvp: .maybe, now: nextTime)
        let merged = local.merging(remote)
        try expect(merged.responses.count == 40, "Merge exceeded member limit")
        try expect(Set(merged.responses.map { $0.participantID }) == Set(local.responses.map { $0.participantID }), "Merge evicted a known reader")
        try expect(merged.responses.first { $0.participantID == "member-0" }?.rsvp == .cant, "A full card could not update an existing reader")
    }),
    ("candidate count and identifiers are validated before producing a message URL", {
        let sample = MessageState.sample(kind: .vote)
        var tooFew = sample
        tooFew.candidates = Array(sample.candidates.prefix(1))
        try expectThrows({ _ = try tooFew.messageURL() }, "One candidate was accepted")
        var tooMany = sample
        tooMany.candidates.append(CandidateBook(id: "fourth", title: "Emma", author: "Jane Austen", reason: "A fourth choice"))
        try expectThrows({ _ = try tooMany.messageURL() }, "Four candidates were accepted")
        var duplicate = sample
        duplicate.candidates[1].id = duplicate.candidates[0].id
        try expectThrows({ _ = try duplicate.messageURL() }, "Duplicate candidate identifiers were accepted")
    }),
    ("response fields and display name limits are checked before mutation", {
        var rsvp = MessageState.sample(kind: .rsvp)
        try expectThrows({ try rsvp.respond(participantID: "a", name: "Ari", page: 3, now: firstTime) }, "RSVP card accepted a bookmark")
        try expectThrows({ try rsvp.respond(participantID: "", name: "Ari", rsvp: .yes, now: firstTime) }, "Empty participant identifier was accepted")
        try expectThrows({ try rsvp.respond(participantID: "a", name: String(repeating: "x", count: 100), rsvp: .yes, now: firstTime) }, "Oversized name was accepted")
        try expect(rsvp.responses.isEmpty, "Rejected fields created a response")
    })
]

var failures = 0
for (name, body) in tests {
    do {
        try body()
        print("PASS " + name)
    } catch {
        failures += 1
        print("FAIL " + name + ": " + String(describing: error))
    }
}
print("\(tests.count - failures)/\(tests.count) model tests passed")
if failures > 0 { exit(1) }
