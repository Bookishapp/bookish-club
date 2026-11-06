import UIKit
import Capacitor
import Messages
import MessageUI

/// The signed-in web client fetches bookish_message_card before calling this bridge.
/// Only an allowlisted image and resource URL leave the app. Sessions stay in memory.
@objc(BookishMessagesPlugin)
public final class BookishMessagesPlugin: CAPPlugin, CAPBridgedPlugin, MFMessageComposeViewControllerDelegate {
    public let identifier = "BookishMessagesPlugin"
    public let jsName = "BookishMessages"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveCalendar", returnType: CAPPluginReturnPromise)
    ]
    private var activeCall: CAPPluginCall?
    private var calendarDirectory: URL?

    @objc func share(_ call: CAPPluginCall) {
        guard let envelope = call.getObject("card"),
              let bytes = try? JSONSerialization.data(withJSONObject: envelope),
              let card = try? ServerMessageCard.decode(data: bytes) else {
            call.reject("This Bookish card is unavailable. Refresh it and try again.", "INVALID_CARD"); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.activeCall == nil,
                  let host = self.bridge?.viewController, host.presentedViewController == nil else {
                call.reject("Finish the open share sheet first.", "BUSY"); return
            }
            guard MFMessageComposeViewController.canSendText() else {
                call.reject("Messages is unavailable on this device.", "UNAVAILABLE"); return
            }
            let message = MSMessage(session: MSSession())
            let layout = MSMessageTemplateLayout()
            layout.image = ServerCardRenderer.image(for: card)
            layout.caption = card.kind == .take ? "New take on \(card.title)" : card.title
            layout.subcaption = card.summary
            message.layout = layout
            message.url = card.resource.url
            message.summaryText = card.kind == .take ? "Anonymous Tea. \(card.pageMarker). Sealed. Open Bookish." : card.summary
            message.accessibilityLabel = message.summaryText
            let composer = MFMessageComposeViewController()
            composer.messageComposeDelegate = self
            composer.message = message
            self.activeCall = call
            host.present(composer, animated: true)
        }
    }

    public func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        let call = activeCall; activeCall = nil
        controller.dismiss(animated: true) {
            switch result {
            case .sent: call?.resolve(["status": "sent"])
            case .cancelled: call?.resolve(["status": "cancelled"])
            case .failed: call?.resolve(["status": "failed"])
            @unknown default: call?.resolve(["status": "failed"])
            }
        }
    }

    @objc func saveCalendar(_ call: CAPPluginCall) {
        guard let content = call.getString("content"), content.utf8.count <= 1_048_576,
              content.hasPrefix("BEGIN:VCALENDAR"),
              content.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("END:VCALENDAR"),
              let data = content.data(using: .utf8) else {
            call.reject("This calendar invite is unavailable. Refresh it and try again.", "INVALID_CALENDAR"); return
        }
        // A fixed basename prevents web-provided paths from escaping the private directory.
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.activeCall == nil,
                  let host = self.bridge?.viewController, host.presentedViewController == nil else {
                call.reject("Finish the open share sheet first.", "BUSY"); return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("bookish-calendar-" + UUID().uuidString, isDirectory: true)
            let url = directory.appendingPathComponent("bookish-meeting.ics")
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: url, options: [.atomic, .completeFileProtection])
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("The calendar invite could not be prepared.", "CALENDAR_FAILED"); return
            }
            self.activeCall = call; self.calendarDirectory = directory
            let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
                guard let self = self else { return }
                if let directory = self.calendarDirectory { try? FileManager.default.removeItem(at: directory) }
                self.calendarDirectory = nil; self.activeCall = nil
                if error != nil { call.reject("The calendar invite could not be shared.", "CALENDAR_FAILED") }
                else { call.resolve(["status": completed ? "shared" : "cancelled"]) }
            }
            if let popover = controller.popoverPresentationController {
                popover.sourceView = host.view; popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
            }
            host.present(controller, animated: true)
        }
    }
}
