# Volume Booster Pro

A powerful browser extension for enhancing your audio experience with advanced volume control, bass boost, and voice enhancement features.

## Features

-   🔊 **Volume Boost:** Amplify audio beyond browser limitations (up to 1000%).
-   ⚡ **Playback Speed Control:** Adjust playback speed from 0x to 10x.
-   🎵 **Bass Boost:** Enhance low frequencies for richer sound (0-200%).
-   🗣️ **Voice Boost:** Improve voice clarity in videos and audio (0-200%).
-   🎯 **Mono Audio:** Convert stereo audio to mono for accessibility or preference.
-   ⚙️ **Per-Site Settings:** Customize and save audio settings for individual websites, or disable the extension entirely for specific sites.
-   🌍 **Global Settings:** Apply your preferred audio settings across all websites by default.
-   🔄 **Real-time Controls:** Adjust all audio parameters instantly via the popup interface.

## Installation

1. Clone the repository:

```bash
git clone https://github.com/DraconDev/volume-and-video-pro
cd volume-booster-pro
```

2. Install dependencies:

```bash
bun install
```

3. Development:

```bash
# For Chrome/Edge development
bun dev

# For Firefox development
bun dev:firefox
```

4. Build for production:

```bash
# For Chrome/Edge
bun build

# For Firefox
bun build:firefox
```

5. Create distribution zip:

```bash
npm run zip        # Chrome/Edge
npm run zip:firefox # Firefox
```

## Project Structure

-   `/src` - Core functionality and types
    -   `media-manager.ts` - Audio processing and management
    -   `media-processor.ts` - Audio effects processing
    -   `types.ts` - TypeScript type definitions
-   `/components` - React components
-   `/entrypoints` - Extension entry points (popup, content script)
-   `/hooks` - Custom React hooks
-   `/public` - Static assets
-   `/assets` - Extension assets (icons, images)

## Technology Stack

-   React 18
-   TypeScript
-   Tailwind CSS
-   WXT (WebExtension Tools)
-   Web Audio API

## Development

The extension uses WXT for development and building. Key commands:

-   `npm run dev` - Start development server
-   `npm run build` - Build for production
-   `npm run compile` - Type-check TypeScript
-   `npm run zip` - Create distribution package

## Configuration

Audio settings can be customized per-site or globally:

-   Volume: 0-1000%
-   Bass Boost: 0-200%
-   Voice Boost: 0-200%
-   Playback Speed: 0x-10x
-   Mono Audio: On/Off

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

See LICENSE file for details

## Support

For support, feature requests, or bug reports, please open an issue on the repository.
