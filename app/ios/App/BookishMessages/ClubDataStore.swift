import Foundation

/// The host currently exposes no App Group entitlement or native club snapshot.
/// Sample cards are local, and message URLs carry only the card members choose to send.
enum ClubDataStore {
    static func card(kind: CardKind) -> MessageState { MessageState.sample(kind: kind) }
}

/// A selected message can still be sitting unsent in the Messages composer.
/// Never treat its local response as committed until didStartSending arrives.
enum CardSelection {
    static func committedState(selected: MessageState, isPending: Bool,
                               known: MessageState?, localParticipantID: String) -> MessageState {
        if !isPending { return known.map { $0.merging(selected) } ?? selected }
        if let known = known { return known }
        var baseline = selected
        baseline.responses.removeAll { $0.participantID == localParticipantID }
        return baseline
    }
}
