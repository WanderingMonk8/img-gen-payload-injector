# Image Payload Injector

A small [Lumiverse](https://lumiverse.chat/) extension for adding custom JSON fields to NanoGPT image generation requests. It also adds a one-click image generation shortcut to each message toolbar, immediately after the speaker button.

## Install

In Lumiverse, open **Extensions → Add Extension → Install from Source** and enter:

```text
https://github.com/WanderingMonk8/img-gen-payload-injector
```

Enable the extension after installation.

## Use

Open the **Image Payload Injector** drawer tab, select a NanoGPT image connection, enter a JSON object, and click **Save override**. For example:

```json
{
  "showExplicitContent": true,
  "resolution": "1k",
  "aspect_ratio": "1:1"
}
```

The editor also accepts a captured `{ "body": { ... } }` object or a full NanoGPT capture with `request_example.body`. It saves every body field you enter without filtering. These fields are merged into future requests made through the selected connection. If you include `prompt` or `model`, those values may override Lumiverse's current prompt or selected model. **Clear override** removes the injected JSON while retaining the connection's other settings.

## Message toolbar shortcut

Hover a chat message and click the image icon after the speaker icon. The shortcut calls Lumiverse's native image generation route with the current chat, clicked message, active image connection, saved prompt mode, output target, and other Image Generation settings. If the selected output target is **Attach to message**, the generated image is attached to the message whose toolbar you used.

To install from a local copy, place the project under `data/extensions/image_payload_injector/` on the Lumiverse server and choose **Import Local** instead.
