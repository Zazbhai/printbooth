---
description: Anime.js v4 guide for LLMs and code editors
applyTo: "**"
---

# Anime.js v4

Anime.js is a modular animation engine for modern browsers. Version 4 introduces a completely redesigned API: the global anime object is gone, you import named functions instead; parameters and callbacks have new names, and timelines, SVG helpers and utilities live in their own modules. This guide captures the v4 API in a structured format suitable for large language models (LLMs) and code editors. Use the citations to trace each rule back to the official documentation or migration guide.

## THIS PROJECT: Setup Status

**Installation**: ✅ `animejs@4.2.1` installed via npm  
**Module Resolution**: ✅ Import maps configured in HTML files (CDN: esm.sh)  
**Script Type**: ✅ `<script type="module">` enabled in `index.html`  
**Current Usage**: ✅ `js/scripts.js` uses v4 API with hero animations and scroll-triggered effects

## CRITICAL: Workflow for using Anime.js v4

Anime.js v4 is tree‑shakeable and modular. Follow these steps when adding animations to a project:

1. **Install Anime.js as a package.** Use npm or pnpm to install the library. Import only the functions you need to minimise bundle size.
2. **Import named modules.** The global anime object no longer exists in v4. Always import functions such as animate, createTimeline, createScope, createSpring, stagger and utilities from their respective modules (see the exports overview below).
3. **Use the new parameter names.** Several parameters changed in v4: value became to, easing became ease, direction has been replaced by boolean flags reversed and alternate, and endDelay has been removed in favour of loopDelay. Update your code accordingly.
4. **Test animations after each change.** Because method names and defaults changed (e.g., play() and reverse() semantics), always verify behaviour in a browser.
5. **Defer heavy animations.** Prefer animating transforms and opacity for better performance. Layout‑affecting properties cause reflows and should be avoided unless necessary.

## Installation notes

Anime.js v4 is available as an npm package and can also be loaded via CDN. Choose one method:

1. **Install via npm** (recommended for bundlers):

npm install animejs@latest

Import what you need:

import { animate } from 'animejs';  
import { stagger, random } from 'animejs/utils';  
import { createTimeline } from 'animejs/timeline';

Named exports encourage tree shaking and reduce bundle size.

1. **CDN or import maps** – Without a bundler, map module names to CDN files in an importmap and use \<script type="module"\> to import functions. For example, map animejs/animation to a CDN path and then import animate inside a module script.

2. **UMD build** – A UMD bundle exists for legacy projects. It exposes a global anime object but does not reflect v4 improvements; avoid this when possible.

## Exports overview

Anime.js v4 splits functionality into distinct modules. Import the functions you need instead of relying on a monolithic object:

### Module

#### animejs
**Key exports**: animate, createTimeline, createScope, createSpring, createDraggable, svg, utils, text, engine
Notes: Primary entry point. Replaces the old global anime object.

#### animejs/animation
**Key exports**: animate
Notes: Core function to create animations. The first argument is the target(s), and the second is the parameters object.

#### animejs/timeline
**Key exports**: createTimeline
Notes: Creates timelines. Timelines are no longer created via anime.timeline(); use this named export.

#### animejs/scope
**Key exports**: createScope
Notes: Creates a scoped context to isolate queries and register methods, useful in frameworks like React.

#### animejs/utils
**Key exports**: stagger, random, round, remove, get, set, modifier, etc.
Notes: Utility functions have moved from the global object into this module. For example utils.round(decimalLength) replaces the old round parameter.

#### animejs/text
**Key exports**: splitText
Notes: Splits strings into spans for text animations.

#### animejs/draggable
**Key exports**: createDraggable
Notes: Makes elements draggable.

#### animejs/svg
**Key exports**: createMotionPath, createDrawable
Notes: New SVG helpers replace the old anime.path() and anime.setDashoffset() functions.

#### animejs/engine
**Key exports**: engine
Notes: Provides manual control of the animation loop (engine.useDefaultMainLoop, engine.update()) and the pauseOnDocumentHidden flag.

## API sections

The sections below organise the v4 API by export. Each section lists the key functions (equivalent to “components” in the DaisyUI example), shows the syntax, and provides rules for usage.

### animate()

**Export**: animate from animejs/animation or as a named export from animejs.

**Syntax**:

animate(targets, options);

* targets – mandatory first argument specifying what to animate. It can be a CSS selector, a DOM element, an array of elements, or a plain object. In v4 the targets key has been removed from the options object.
* options – parameters object. Use the new names:
* to (instead of value) for end values on property objects.
* ease (instead of easing) for specifying easing functions.
* alternate and reversed booleans (instead of direction) to play the animation forwards/backwards or alternate.
* loopDelay to add a pause between loops; endDelay no longer exists.
* modifier to transform values on the fly; round has been removed and replaced by utility modifiers like utils.round().
* onBegin, onUpdate, onRender, onComplete, onLoop for callbacks; old callback names (begin, update, change) are gone.

**Rules**:

1. **Targets first.** Always pass the target(s) as the first argument. Removing the targets key avoids confusion and improves tree shaking.
2. **Use to for end values.** When specifying property objects, use { to: value } instead of { value: value }.
3. **Booleans replace direction strings.** Set reversed: true to play backwards and alternate: true to alternate forwards/backwards.
4. **Use ease names without the ease prefix.** For example, 'outQuad' instead of 'easeOutQuad'. The default easing is 'out(2)'.
5. **Callbacks use the on prefix.** Name your callbacks onBegin, onUpdate, onRender, onComplete and onLoop. The onRender callback replaces the old change callback.
6. **Promises via .then().** Instead of accessing an animation’s finished promise, chain .then(callback) directly on the returned animation instance.

**Example**:

import { animate } from 'animejs';  
import { random, stagger, round } from 'animejs/utils';

// animate four boxes to random opacity with staggered delays  
const animation \= animate('.box', {  
  opacity: { to: () \=\> random(0.3, 1\) },  
  translateX: { to: 200 },  
  duration: 800,  
  loop: 2,  
  loopDelay: 300,  
  alternate: true,  
  ease: 'inOutQuad',  
  delay: stagger(50),  
  onBegin: () \=\> console.log('Started'),  
  onComplete: () \=\> console.log('Completed'),  
});

// handle promise using .then()  
animation.then(() \=\> console.log('All iterations done'));

### createTimeline()

**Export**: createTimeline from animejs/timeline or animejs.

**Syntax**:

const tl \= createTimeline({  
  defaults: { ease: 'outQuad', duration: 250 },  
  loop: 1,  
  loopDelay: 200,  
});

tl.add('.box', { translateX: { to: 200 } });  
tl.add('.circle', { scale: { to: 2 } }, '+=500');  
tl.play();

**Rules**:

1. **Use createTimeline().** Timelines are no longer created via anime.timeline(); import the function directly.
2. **Provide a defaults object.** Set default easing and duration for all children inside the defaults property.
3. **Specify children with targets first.** Each .add() call takes the targets as the first argument, followed by options. Offsets can be numbers or relative strings like '+=500'.
4. **Loop semantics changed.** The timeline loop parameter defines how many extra repetitions occur. A value of 1 means the animation runs twice.
5. **Control methods changed.** play() always plays forwards, reverse() always plays backwards, and the new alternate() method alternates direction.

### createScope()

**Export**: createScope from animejs/scope or animejs.

**Purpose**: Creates a scoped environment that limits selectors and allows registering custom methods. Useful when animating inside components (e.g., React) to prevent animations from affecting other parts of the DOM.

**Syntax**:

const scope \= createScope({ root: element });  
scope.qs(selector); // query single element within scope  
scope.qsa(selector); // query all elements within scope  
scope.registerMethod(name, fn); // attach custom methods to the scope  
scope.revert(); // cleanup: cancels animations and removes registered methods

**Rules**:

1. **Pass a root element.** Only descendants of this element are queried.
2. **Use registerMethod() to expose reusable functions** (e.g., rotateLogo) to the outside world.
3. **Call revert() in cleanup.** This cancels all scoped animations and removes registered methods.

### utils

**Export**: utils from animejs/utils or animejs.

**Functions**:

* stagger(value, options?) – Generates a delay sequence. The v4 API still supports value, from, range and grid. The direction option has been replaced by reversed (boolean), and the easing option has been replaced by ease.
* random(min, max) – Returns a random number in the range.
* round(decimalLength) – Returns a modifier function that rounds values to a fixed number of decimals.
* remove(targets), get(target, property), set(targets, properties) – Manage animations and read/set values.
* modifier(fn) – Apply a custom value modifier to all values of an animation; use this instead of the old round parameter.

**Rule**: Import only what you need from animejs/utils to keep bundles small.

### createDraggable()

**Export**: createDraggable from animejs/draggable or animejs.

**Purpose**: Makes an element draggable and integrates with the animation system. The function returns an object with methods to interact with the draggable element.

**Syntax**:

const drag \= createDraggable({ el: element, bounds: container });  
drag.destroy(); // remove listeners and cleanup

### text module

**Export**: splitText from animejs/text or animejs.

**Purpose**: Splits a string into DOM nodes for word or character animations.

**Syntax**:

const nodes \= splitText({ text: 'Animate me', by: 'word', tag: 'span' });

### svg module

**Exports**: createMotionPath, createDrawable from animejs/svg or animejs.

**Purpose**: Handles motion along paths and line drawing. Replaces the old anime.path() and anime.setDashoffset() functions.

**Syntax**:

import { createMotionPath, createDrawable } from 'animejs/svg';

// motion path  
const { translateX, translateY, rotate } \= createMotionPath('svg path');  
animate('.object', { translateX, translateY, rotate, duration: 2000, ease: 'inOutQuad' });

// line drawing  
const drawable \= createDrawable('path');  
animate(drawable, { draw: '0 1', duration: 1500, ease: 'outQuad' });

**Rules**:

1. **Do not use anime.path() or anime.setDashoffset()** – these functions have been removed.
2. **Create the motion path or drawable once** and reuse the returned functions or objects to animate multiple elements.

### createSpring()

**Export**: createSpring from animejs.

**Purpose**: Generates a spring easing function. In v4, spring easings are not built into the core and must be created via createSpring().

**Syntax**:

import { createSpring } from 'animejs';

const springEase \= createSpring({ mass: 1, stiffness: 200, damping: 10, velocity: 0 });  
animate('.ball', { translateY: { to: 300 }, ease: springEase, loop: true, alternate: true });

### engine

**Export**: engine from animejs/engine or animejs.

**Purpose**: Controls the main loop and document‑visibility behaviour.

**Features**:

* engine.useDefaultMainLoop – Set to false to disable the built‑in loop and update Anime.js manually.
* engine.update() – Call this to advance animations when using a custom render loop.
* engine.pauseOnDocumentHidden – Replaces anime.suspendWhenDocumentHidden. Set this to false if you want animations to keep running when the tab is hidden.

## Callbacks and promises

Callbacks in v4 use the on prefix. The old callbacks (begin, update, change, etc.) have been removed or renamed.

### Callbacks

#### onBegin
When it fires: When the animation (and its delay) starts. Replaces begin.
#### onUpdate
When it fires: At every frame update.
#### onRender
When it fires: Whenever a value changes. Replaces the old change callback.
#### onComplete
When it fires: When the animation finishes.
#### onLoop
When it fires: At the end of each loop. Replaces loopBegin and loopComplete.

To execute code after an animation finishes, call .then() on the returned animation instance:

animate('.box', { opacity: { to: 1 }, duration: 500 }).then(() \=\> {  
  console.log('Animation finished');  
});

## Examples

### Vanilla JavaScript

import { animate } from 'animejs';  
import { stagger, random } from 'animejs/utils';  
import { createDraggable } from 'animejs/draggable';  
import { createSpring } from 'animejs';

// select elements  
const squares \= document.querySelectorAll('.square');

// animate scale and opacity with a spring ease and staggered delays  
animate(squares, {  
  scale: { to: 1.2 },  
  opacity: { to: () \=\> random(0.5, 1\) },  
  duration: 800,  
  alternate: true,  
  loop: true,  
  ease: createSpring({ mass: 1, stiffness: 200, damping: 12 }),  
  delay: stagger(80),  
  onLoop: () \=\> console.log('loop\!'),  
});

// make the logo draggable  
const drag \= createDraggable({ el: document.querySelector('.logo') });

// rotate logo on button click using the new API  
document.querySelector('.rotate-btn').addEventListener('click', () \=\> {  
  animate('.logo', {  
    rotate: { to: 360 },  
    duration: 600,  
    ease: 'outQuad',  
  });  
});

### React

import { useRef, useEffect } from 'react';  
import { animate, createScope, createSpring } from 'animejs';

function LogoAnimator() {  
  const rootRef \= useRef(null);

  useEffect(() \=\> {  
    const scope \= createScope({ root: rootRef.current });  
    const spring \= createSpring({ mass: 1, stiffness: 150, damping: 8 });  
    // bounce animation  
    animate('.logo', {  
      scale: { to: 1.3 },  
      duration: 800,  
      alternate: true,  
      loop: true,  
      ease: spring,  
    });  
    // register a method to rotate the logo  
    scope.registerMethod('rotateLogo', () \=\> {  
      animate('.logo', {  
        rotate: { to: 360 },  
        duration: 600,  
        ease: 'inOutQuad',  
      });  
    });  
    return () \=\> {  
      scope.revert();  
    };  
  }, \[\]);

  return (  
    \<div ref={rootRef}\>  
      \<div className="logo"\>\</div\>  
      \<button onClick={() \=\> rootRef.current.rotateLogo()}\>Rotate\</button\>  
    \</div\>  
  );  
}

export default LogoAnimator;

## Common issues and solutions

* **Old API names** – If your code still uses anime() or anime.timeline(), update it to use animate() and createTimeline().
* **Using value instead of to** – Replace value with to inside property objects.
* **Direction strings** – Replace direction: 'reverse' with reversed: true and direction: 'alternate' with alternate: true.
* **Callback names** – Prefix callbacks with on (e.g., onBegin, onUpdate).
* **endDelay** – Use loopDelay instead of endDelay.
* **round** – Use modifier: utils.round(decimalLength) or call round() from utils.
* **SVG helpers** – Use createMotionPath() and createDrawable() instead of anime.path() and anime.setDashoffset().
* **Finished promises** – Use .then() instead of accessing animation.finished.

## Summary

Anime.js v4 replaces the monolithic global API with modular imports and introduces new parameter names, callbacks, and helpers. This guide groups the v4 features into sections akin to components, provides syntax and rules for each, and includes examples for vanilla JavaScript and React. Adhering to these rules will ensure smooth adoption of Anime.js v4 in your projects.

## THIS PROJECT: Module Resolution Setup

This project uses **Import Maps** for browser module resolution (no bundler required):

### HTML Configuration
Both `index.html` and `anime-test.html` include in the `<head>`:

```html
<script type="importmap">
{
  "imports": {
    "animejs": "https://esm.sh/animejs@4",
    "animejs/animation": "https://esm.sh/animejs@4/lib/animation",
    "animejs/utils": "https://esm.sh/animejs@4/lib/utils",
    "animejs/timeline": "https://esm.sh/animejs@4/lib/timeline",
    "animejs/scope": "https://esm.sh/animejs@4/lib/scope",
    "animejs/draggable": "https://esm.sh/animejs@4/lib/draggable",
    "animejs/svg": "https://esm.sh/animejs@4/lib/svg",
    "animejs/text": "https://esm.sh/animejs@4/lib/text",
    "animejs/engine": "https://esm.sh/animejs@4/lib/engine"
  }
}
</script>
<script type="module" src="js/scripts.js"></script>
```

**Browser Support**: Chrome 89+, Edge 89+, Safari 16.4+, Firefox 108+

### Alternative Options
1. **Vite** (for production builds): `npm install -D vite` then use `npm run dev`
2. **Local imports**: Change import map URLs to `./node_modules/animejs/lib/...`

## THIS PROJECT: Current Animations

The portfolio site (`js/scripts.js`) implements:

1. **Hero Section**: Avatar scale/rotate + text stagger on load
2. **Scroll Animations**: Cards and sections fade in using IntersectionObserver
3. **Header**: Navbar slides in after component loads

Example from `js/scripts.js`:
```javascript
import { animate } from 'animejs';
import { stagger } from 'animejs/utils';

// Hero entrance animation
animate('.hero .avatar', {
  scale: { to: 1 },
  rotate: { to: 0 },
  opacity: { to: 1 },
  duration: 800,
  ease: 'outQuad'
});

// Scroll-triggered animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animate(entry.target, {
        opacity: { to: 1 },
        translateY: { to: 0 },
        duration: 600,
        ease: 'outQuad'
      });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
```

## THIS PROJECT: Quick Commands

```bash
# Build CSS (Terminal 1)
npm run dev

# Serve site (Terminal 2)
npm run serve

# Or open directly (Windows)
open-site.bat

# Test animations
# Open anime-test.html in browser
```