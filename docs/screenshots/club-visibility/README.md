# Club visibility QA screenshots

Captured October 23 in Google Chrome from the built website, using synthetic records, memory-only PostgreSQL, and the actual directory, host settings, and join HTTP handlers. Email transport was disabled. These are functional QA captures of the existing UI, not design mockups or production club records. No new artwork was created.

| Capture | Verified behavior |
| --- | --- |
| [Creation, desktop](01-create-private.jpg) | All three required choices, with Private preselected. |
| [Discovery](02-discovery-private-open.jpg) | Open joins directly; Private shows its name, area, and current book. The synthetic Hidden club is absent. |
| [Host settings](03-host-private-request.jpg) | Private selected, pending reader, approval controls, and invite rotation. |
| [Hidden saved](04-host-hidden.jpg) | Save succeeds immediately, and pending public requests are closed. |
| [Discovery after hiding](05-discovery-after-hide.jpg) | The former Private club is absent; only the Open club remains. |
| [Creation, mobile](06-create-mobile.jpg) | 390-pixel viewport, wrapped labels, and Private preselected. |
| [Rendered map after hiding](07-map-after-hide.jpg) | Austin contributes one Open club, with no Hidden names or counts. |

Full-page captures were taken before asynchronous map tiles finished rendering. The separate normal-viewport map capture shows the completed map. MapLibre's WebGL canvas is captured correctly in the normal viewport. Rotation also returned its success status during this local session; active invite values and host capabilities are deliberately excluded from screenshots.

The iOS workflow builds, launches, and captures each native simulator tab in the `ios-simulator-screenshots` artifact. See the PR checks for the latest run. Simulator evidence does not replace an on-device release check or retirement of older TestFlight builds that contain snapshots.
