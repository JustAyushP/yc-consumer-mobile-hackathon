# Disabled player-link entry contract tests

Pinned base: `capy/player-link-onboarding` at **d7657c70b81bbd54935f64466c2febb7db67eefb**. That Brain source is unfinished and unreviewed. This branch adds only local tests and this note; it is not an accepted integration or a deployable enrollment feature.

The tests invoke the actual published function paths with `makeFunctionReference`, because this base's checked-in generated API does not include the new exports. They do not create substitute implementations or edit generated/backend files. They verify default-off public onboarding, default-off internal mint/redemption, the disabled `/keiki/turn` HTTP entry, and rejection of an unbound model-generated `/start` without token consumption, new bindings or replacement of the fixture tester.

No provider entry adapter is enabled or invented. Keiki's current `consult_ravo` runs after the model; its `input.playerMessage` is not raw provider input. A start token sent there can already appear in model/history before our code runs. These tests do not guarantee the safety of sending a token to an already-bound conversation: existing consult can persist ordinary bound messages. Do not send a real enrollment token through the current tool, global prompt, trace, screenshot or normal chat storage.

Automatic redemption remains unavailable until a real pre-model interception mechanism is established and reviewed. No token should be issued to a UI that would open that unsupported flow. High-entropy bearer possession can authorize only the exact pending participant selected at issuance; it does not authenticate the destination Telegram account. No production authentication, live redemption, single-use concurrency proof or account-ownership claim is made by these offline disabled-state tests. Brain owns mint/redeem transaction semantics and their acceptance tests.

All onboarding/safe-handoff/redemption gates remain unset in fixtures and no live environment is changed. The tests use only synthetic local records and assert their state is unchanged. Existing prebound consult tests remain part of the same chat suite.
