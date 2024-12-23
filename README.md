# Volume Booster Pro

A powerful browser extension for enhancing your audio experience with advanced volume control, bass boost, and voice enhancement features.

## Features

-   🔊 Volume Boost: Amplify audio beyond browser limitations
-   🎵 Bass Boost: Enhance low frequencies for richer sound
-   🗣️ Voice Boost: Improve voice clarity in videos and audio
-   ⚡ Per-Site Settings: Customize audio settings for each website
-   🔄 Global Presets: Apply your preferred settings across all sites
-   🎚️ Real-time Controls: Adjust audio parameters on the fly
-   🎯 Mono Audio: Convert stereo to mono for accessibility

## Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd volume-booster-pro
```

2. Install dependencies:

```bash
npm install
```

3. Development:

```bash
# For Chrome/Edge development
npm run dev

# For Firefox development
npm run dev:firefox
```

4. Build for production:

```bash
# For Chrome/Edge
npm run build

# For Firefox
npm run build:firefox
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

[License Type] - See LICENSE file for details

## Support

For support, feature requests, or bug reports, please open an issue on the repository.
