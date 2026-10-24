import UIKit
import Messages

final class MessagesViewController: MSMessagesAppViewController, UITextFieldDelegate {
    private var state = ClubDataStore.card(kind: .rsvp)
    private var session: MSSession?
    private var knownCards: [UUID: MessageState] = [:]
    private var conversationKey: String?
    private var pending: (message: MSMessage, state: MessageState)?
    private var selectedRSVP: RSVPChoice = .yes
    private var selectedVote: String?
    private var invalidSelection = false
    private var showingStickers = false
    private var cardRows: [UIView] = []
    private let stickerPicker = StickerPickerViewController()
    private let content = UIStackView()
    private let choices = UIStackView()
    private let nameField = UITextField()
    private let pageField = UITextField()
    private let statusLabel = UILabel()
    private let detailLabel = UILabel()
    private let summaryLabel = UILabel()
    private let artView = UIImageView()
    private let mode = UISegmentedControl(items: ["RSVP", "Book vote", "Bookmarks", "Stickers"])
    private let addButton = UIButton(type: .system)
    private let newButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = BookishTheme.cream
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        content.axis = .vertical; content.spacing = 14; content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 16),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40)
        ])
        content.addArrangedSubview(label("Bookish", style: .title))
        mode.selectedSegmentIndex = 0; mode.selectedSegmentTintColor = BookishTheme.pink
        mode.setTitleTextAttributes([.foregroundColor: BookishTheme.wine, .font: BookishTheme.font(.caption)], for: .normal)
        mode.addTarget(self, action: #selector(changeKind), for: .valueChanged)
        content.addArrangedSubview(mode)
        artView.contentMode = .scaleAspectFit; artView.isAccessibilityElement = false
        artView.heightAnchor.constraint(equalToConstant: 92).isActive = true
        content.addArrangedSubview(artView)
        configure(detailLabel, style: .heading); content.addArrangedSubview(detailLabel)
        configure(summaryLabel, style: .body); content.addArrangedSubview(summaryLabel)
        content.addArrangedSubview(label("Your name on the card", style: .caption))
        configure(nameField, placeholder: "Reader")
        nameField.text = UserDefaults.standard.string(forKey: "BookishMessagesDisplayName")
        nameField.accessibilityLabel = "Your name on the card"
        configure(pageField, placeholder: "Page number"); pageField.keyboardType = .numberPad
        nameField.autocapitalizationType = .words; nameField.returnKeyType = .done
        content.addArrangedSubview(nameField)
        choices.axis = .vertical; choices.spacing = 10; content.addArrangedSubview(choices)
        style(addButton, primary: true); addButton.setTitle("Add to message", for: .normal)
        addButton.addTarget(self, action: #selector(prepareMessage), for: .touchUpInside)
        content.addArrangedSubview(addButton)
        configure(statusLabel, style: .caption)
        content.addArrangedSubview(statusLabel)
        style(newButton, primary: false); newButton.setTitle("Start a new card", for: .normal)
        newButton.addTarget(self, action: #selector(startNewCard), for: .touchUpInside)
        content.addArrangedSubview(newButton)
        cardRows = Array(content.arrangedSubviews.dropFirst(2))
        addChild(stickerPicker)
        content.addArrangedSubview(stickerPicker.view)
        let stickerHeight = stickerPicker.view.heightAnchor.constraint(equalToConstant: 360)
        stickerHeight.priority = .defaultHigh; stickerHeight.isActive = true
        stickerPicker.didMove(toParent: self)
        render()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        loadViewIfNeeded()
        let key = ([conversation.localParticipantIdentifier.uuidString] + conversation.remoteParticipantIdentifiers.map { $0.uuidString }.sorted()).joined(separator: ":")
        if key != conversationKey {
            conversationKey = key; knownCards.removeAll(); session = nil; pending = nil
            state = ClubDataStore.card(kind: .rsvp); invalidSelection = false; showingStickers = false
            selectedRSVP = .yes; selectedVote = nil; pageField.text = nil
        }
        if let message = conversation.selectedMessage { select(message) }
        else { render() }
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) { select(message) }

    override func didReceive(_ message: MSMessage, conversation: MSConversation) {
        guard let url = message.url, let incoming = try? MessageState.decode(url: url) else { return }
        let merged = knownCards[incoming.cardID].map { $0.merging(incoming) } ?? incoming
        knownCards[incoming.cardID] = merged
        // selectedMessage may still refer to an older revision. Keep the active session current.
        if incoming.cardID == state.cardID, message.session == session {
            state = state.merging(merged); render()
        }
    }

    override func didStartSending(_ message: MSMessage, conversation: MSConversation) {
        guard let draft = pending, draft.message.url == message.url else { return }
        state = state.cardID == draft.state.cardID ? state.merging(draft.state) : draft.state
        session = message.session
        knownCards[state.cardID] = state; pending = nil
        render(); setStatus("Your card was sent.")
    }

    override func didCancelSending(_ message: MSMessage, conversation: MSConversation) {
        guard pending?.message.url == message.url else { return }
        pending = nil; render(); setStatus("Card removed from the message. You can try again.")
    }

    private func select(_ message: MSMessage) {
        showingStickers = false
        if let draft = pending {
            render()
            setStatus(draft.message.url == message.url
                      ? "Ready in Messages. Tap Send, or remove the draft to keep editing."
                      : "Send or remove your current draft in Messages before opening another card.")
            return
        }
        guard let url = message.url, let decoded = try? MessageState.decode(url: url) else {
            invalidSelection = true; session = nil; render()
            setStatus("This card cannot be opened by this version of Bookish. Start a new card to continue.")
            return
        }
        let participant = activeConversation?.localParticipantIdentifier.uuidString ?? ""
        state = CardSelection.committedState(selected: decoded, isPending: message.isPending,
                                              known: knownCards[decoded.cardID], localParticipantID: participant)
        session = message.session; invalidSelection = false
        if message.isPending { pending = (message, decoded) }
        else { knownCards[state.cardID] = state }
        let formSnapshot = message.isPending ? decoded : state
        if let response = formSnapshot.responses.first(where: { $0.participantID == participant }) {
            selectedRSVP = response.rsvp ?? .yes; selectedVote = response.voteID
            pageField.text = response.page.map(String.init)
        } else { selectedRSVP = .yes; selectedVote = nil; pageField.text = nil }
        render()
    }

    @objc private func changeKind() {
        guard pending == nil else { return }
        if mode.selectedSegmentIndex == 3 { showingStickers = true; render(); return }
        guard CardKind.allCases.indices.contains(mode.selectedSegmentIndex) else { return }
        let kind = CardKind.allCases[mode.selectedSegmentIndex]
        if showingStickers && kind == state.kind { showingStickers = false; render(); return }
        showingStickers = false
        state = ClubDataStore.card(kind: kind)
        session = nil; invalidSelection = false; selectedVote = nil; selectedRSVP = .yes; pageField.text = nil
        render()
    }

    @objc private func startNewCard() {
        state = ClubDataStore.card(kind: state.kind); session = nil; pending = nil
        invalidSelection = false; selectedRSVP = .yes; selectedVote = nil; pageField.text = nil; render()
    }

    private func render() {
        guard isViewLoaded else { return }
        mode.selectedSegmentIndex = showingStickers ? 3 : (CardKind.allCases.firstIndex(of: state.kind) ?? 0)
        for row in cardRows {
            if showingStickers {
                content.removeArrangedSubview(row); row.removeFromSuperview()
            } else if row.superview == nil { content.addArrangedSubview(row) }
        }
        if showingStickers {
            if stickerPicker.view.superview == nil { content.addArrangedSubview(stickerPicker.view) }
        } else {
            content.removeArrangedSubview(stickerPicker.view); stickerPicker.view.removeFromSuperview()
        }
        artView.image = BookishTheme.art(for: state.kind)
        detailLabel.text = state.kind == .rsvp
            ? "\(state.meetingTitle)\n\(state.meetingDetail)\n\(state.readingTitle)"
            : state.kind == .vote ? "Choose our next read" : "\(state.readingTitle)\nA place for every bookmark. Read at your own pace."
        let memberLines = state.responses.map { member -> String in
            switch state.kind {
            case .rsvp: return "\(member.name): \(member.rsvp.map(BookishTheme.label) ?? "No RSVP yet")"
            case .vote:
                let title = state.candidates.first { $0.id == member.voteID }?.title ?? "No choice yet"
                return "\(member.name): \(title)"
            case .bookmarks: return "\(member.name): \(member.page.map { "page \($0)" } ?? "No bookmark yet")"
            }
        }
        summaryLabel.text = ([CardRenderer.summary(state)] + memberLines).joined(separator: "\n")
        choices.arrangedSubviews.forEach { choices.removeArrangedSubview($0); $0.removeFromSuperview() }
        switch state.kind {
        case .rsvp:
            for choice in RSVPChoice.allCases {
                let button = choiceButton(BookishTheme.label(for: choice), selected: selectedRSVP == choice)
                button.addAction(UIAction { [weak self] _ in self?.selectedRSVP = choice; self?.render() }, for: .touchUpInside)
                choices.addArrangedSubview(button)
            }
        case .vote:
            for book in state.candidates {
                let button = choiceButton("\(book.title)\n\(book.author)\n\(book.reason)", selected: selectedVote == book.id)
                button.addAction(UIAction { [weak self] _ in self?.selectedVote = book.id; self?.render() }, for: .touchUpInside)
                choices.addArrangedSubview(button)
            }
        case .bookmarks:
            choices.addArrangedSubview(label("Your bookmark, from page 0 to \(state.totalPages)", style: .caption))
            choices.addArrangedSubview(pageField)
        }
        let editing = pending == nil
        addButton.isEnabled = editing && !invalidSelection
        mode.isEnabled = editing; newButton.isEnabled = editing
        nameField.isEnabled = editing; pageField.isEnabled = editing; choices.isUserInteractionEnabled = editing
        statusLabel.text = invalidSelection ? "Start a new card to continue." : pending == nil
            ? "Sample club details. Add your response, then tap Send in Messages."
            : "Ready in Messages. Tap Send to share, or remove the draft to keep editing."
    }

    @objc private func prepareMessage() {
        guard pending == nil, !invalidSelection, let conversation = activeConversation else {
            setStatus("Open Bookish inside an iMessage conversation to share a card."); return
        }
        view.endEditing(true)
        let name = (nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var outgoing = state
        do {
            if state.kind == .vote && selectedVote == nil { setStatus("Choose a book first."); return }
            let page = state.kind == .bookmarks ? Int(pageField.text ?? "") : nil
            if state.kind == .bookmarks && page == nil { setStatus("Enter a whole page number."); return }
            try outgoing.respond(participantID: conversation.localParticipantIdentifier.uuidString,
                                 name: name.isEmpty ? "Reader" : name,
                                 rsvp: state.kind == .rsvp ? selectedRSVP : nil,
                                 voteID: state.kind == .vote ? selectedVote : nil, page: page)
            let message = MSMessage(session: session ?? MSSession())
            let layout = MSMessageTemplateLayout()
            layout.image = CardRenderer.image(for: outgoing)
            layout.caption = state.kind == .rsvp ? state.meetingTitle : BookishTheme.title(for: state.kind)
            layout.subcaption = CardRenderer.summary(outgoing)
            message.layout = layout; message.url = try outgoing.messageURL()
            message.summaryText = "\(name.isEmpty ? "Reader" : name) updated \(BookishTheme.title(for: state.kind).lowercased())."
            message.accessibilityLabel = "\(layout.caption ?? "Bookish"). \(layout.subcaption ?? "")"
            pending = (message, outgoing); render()
            conversation.insert(message) { [weak self] error in
                DispatchQueue.main.async {
                    guard let self = self, self.pending?.message === message else { return }
                    if error != nil {
                        self.pending = nil; self.render(); self.setStatus("The card could not be added. Please try again.")
                    } else {
                        UserDefaults.standard.set(name.isEmpty ? "Reader" : name, forKey: "BookishMessagesDisplayName")
                        self.setStatus("Ready in Messages. Tap Send to share your card.")
                    }
                }
            }
        } catch {
            setStatus("Check your name, book choice, and page number. This card may be full.")
        }
    }

    private func label(_ text: String, style: BookishTheme.TypeStyle) -> UILabel {
        let result = UILabel(); configure(result, style: style); result.text = text; return result
    }
    private func configure(_ label: UILabel, style: BookishTheme.TypeStyle) {
        label.font = BookishTheme.font(style); label.textColor = BookishTheme.wine
        label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true
    }
    private func configure(_ field: UITextField, placeholder: String) {
        field.placeholder = placeholder; field.font = BookishTheme.font(.body); field.textColor = BookishTheme.wine
        field.backgroundColor = BookishTheme.butter; field.borderStyle = .roundedRect
        field.adjustsFontForContentSizeCategory = true; field.delegate = self; field.accessibilityLabel = placeholder
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    }
    private func style(_ button: UIButton, primary: Bool) {
        var config = UIButton.Configuration.filled()
        config.baseBackgroundColor = primary ? BookishTheme.wine : BookishTheme.lilac
        config.baseForegroundColor = primary ? BookishTheme.cream : BookishTheme.wine
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var result = incoming; result.font = BookishTheme.font(.button); return result
        }
        config.cornerStyle = .medium; config.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 16, bottom: 13, trailing: 16)
        button.configuration = config; button.titleLabel?.numberOfLines = 0
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    }
    private func choiceButton(_ title: String, selected: Bool) -> UIButton {
        let button = UIButton(type: .system); style(button, primary: selected)
        button.setTitle(title, for: .normal); button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        return button
    }
    private func setStatus(_ text: String) {
        statusLabel.text = text; UIAccessibility.post(notification: .announcement, argument: text)
    }
    func textFieldShouldReturn(_ textField: UITextField) -> Bool { textField.resignFirstResponder(); return true }
}
