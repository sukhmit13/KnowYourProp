---
name: mapbox-gl v3 upgrade
description: Why the project uses mapbox-gl v3 and the v2 marker crash it fixes
---
mapbox-gl 2.15 has an internal bug: Marker occlusion (`_evaluateOpacity`/`getOpacityAtLatLng`) fires on a delayed timer and crashes with "undefined is not an object (evaluating 'this.properties.get')" when the map style is torn down or not fully ready (frequent under HMR / unmount).

**Why:** v2 is EOL — no v2 patch exists; the fix is only in v3. react-map-gl v8 targets v3.
**How to apply:** keep `mapbox-gl` on ^3; do NOT reinstall `@types/mapbox-gl` (v3 ships its own types, the DT package conflicts). If a similar marker crash reappears, suspect a map being unmounted while markers are attached, not app code.
