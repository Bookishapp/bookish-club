// Exact replacements verified by HTTPS GET on October 23, 2026.
// Unknown HTTP sources are not upgraded without checking their destination.
import upgrades from '../../data/source-url-upgrades.json' with { type: 'json' };
export const sourceURLUpgrades = new Map<string, string>(upgrades as [string, string][]);
