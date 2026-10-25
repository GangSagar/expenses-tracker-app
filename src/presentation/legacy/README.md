# Existing presentation layer

This folder contains the app's current screens, components, styles, and navigation. It is kept operational as a legacy presentation adapter while a replacement UI is developed.

Keep transaction parsing, decision rules, application workflows, and persistence outside this folder. Future UI changes should call the application-facing contracts/use cases rather than owning transaction behavior. This relocation did not intentionally change layout or visual design.
