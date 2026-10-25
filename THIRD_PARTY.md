# References and provenance

- [Open Space](https://github.com/Fantomiald/open-space), MIT: visual/interaction reference for an inhabited room, character identity, bubbles and compact conversation windows. No source, screenshots or art from it is bundled in this scaffold.
- [Microduck simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator), Apache-2.0 application: intended physics/policy integration reference. Robot geometry and policy assets can have separate licenses; verify each before importing. No upstream robot mesh, MJCF or ONNX policy asset is bundled yet.
- [Burrow](https://github.com/jerryjlwang/Burrow): prior art for conversational embodied interaction, not a runtime dependency.
- Font: Plus Jakarta Sans, supplied through its Fontsource package; its license is included in `apps/web/public/licenses/PlusJakartaSans-OFL.txt` and copied to the built site.
- All room and robot geometry in the scaffold is newly authored procedural placeholder geometry. It is not a BD-1 asset or a recovered practice export.

Installed dependencies retain their respective licenses. Public repository visibility does not automatically grant a license to original project code; the owner can choose that license separately.

- Welcome controls: adapted from Arc UI (MIT), © 2026 Elia Kuratli; license in `apps/web/src/welcome/arc/LICENSE`.
- Grandstander 900: self-hosted display font from Google Fonts, SIL OFL 1.1; notice in `apps/web/public/welcome/fonts/OFL-Grandstander.txt`.
- Welcome artwork: owner-supplied concept illustrations, used as editorial stills, not simulation footage. Meadowbell informed composition and button styling; its media and source are not bundled.
