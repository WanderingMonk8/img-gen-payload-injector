# Image Payload Injector

A small [Lumiverse](https://lumiverse.chat/) extension for adding custom JSON fields to NanoGPT image generation requests. It also adds a one-click image generation shortcut to each message toolbar, immediately after the speaker button.

## Install

In Lumiverse, open **Extensions → Add Extension → Install from Source** and enter:

```text
https://github.com/WanderingMonk8/img-gen-payload-injector
```

Requires Lumiverse 1.2.0 or newer. Enable the extension and grant its **Image Generation** permission.

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

Hover a chat message and click the image icon after the speaker icon. The frontend sends the request to the extension backend, which invokes Lumiverse's native image generation pipeline through `spindle.imageGen`. It uses the active image connection and the native scene or custom prompt pipeline, including the connection defaults where the JSON override is stored.

The generated image opens in a Lumiverse preview modal. Errors from Lumiverse or the image provider appear in a toast instead of leaving the button spinning.

To install from a local copy, place the project under `data/extensions/image_payload_injector/` on the Lumiverse server and choose **Import Local**.
