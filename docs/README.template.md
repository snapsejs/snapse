<!-- Generated from docs/README.template.md by scripts/buildReadme.mjs. Do not edit README.md directly;
     edit the template or the example sources and run `npm run build:readme`. -->
# Snapse

Snapse is a JavaScript/TypeScript library for creating interactive web pages and applications. It provides state management with a tightly integrated store, and high level components based on DOM elements.

Snapse ties chain-reactive states into components to create atomic reactivity, while offering a straightforward development experience that scales from the simplest web page to the most advanced application.

Snapse is a very small library. But its goal is to do everything that large web frameworks do - just more simply by leveraging standard JavaScript functionality.

## Compatibility

Snapse follows the specifications for ECMAScript 2021 strict mode. It does not modify any global objects or functions. Snapse adheres to the W3C defined behaviour for DOM elements, but extends it - most obviously by supporting the insertion of stateful content. It does not insert 'magic content' into the DOM, and you are free to directly modify the DOM if you so choose - with the obvious limitation that anything Snapse is delegated to update may remove elements and content as the corresponding state changes.

Snapse is not a framework - it is a library designed to co-exist with any other tools or libraries that support JavaScript and web standards.

### Import and require

Both ESM and CommonJS imports are supported, as well as loading snapse.js directly in a web page. In DEV mode, Snapse provides source maps and throws helpful error messages.

### TypeScript

Snapse preserves TypeScript types, and all functions including DOM element factory functions are fully typed, requiring a minimum of explicit typing.

## Usage

Create a Vite project, then add Snapse:

```sh
npm create vite@latest my-app -- --template vanilla-ts
cd my-app
npm install snapse
```

Replace the contents of `src/main.ts`:

<!-- snippet: usage -->

Start the dev server with `npm run dev`.

### Without a build step

Snapse can also be loaded directly in a web page, as a single JavaScript module that includes all elements. In this module, the SVG elements whose names clash with HTML elements are named `svg_a`, `svg_script`, `svg_style` and `svg_title`:

<!-- snippet: browser -->

### Lint rule

A State is an object, so `if (s.done)` or `s.done && …` is always true, whatever the value. TypeScript cannot see this, but the `snapse/lint` ESLint rule can. It needs [typescript-eslint](https://typescript-eslint.io) with type information:

```sh
npm install --save-dev eslint typescript-eslint
```

```js
// eslint.config.js
import snapse from 'snapse/lint'

export default tseslint.config(
  {
    ...
    plugins: { snapse },
    rules: {
      'snapse/no-state-truthiness': 'error',
      'snapse/no-boolean-state-argument': 'warn',
    },
  },
)
```

To test the value of a boolean or number State, use `+s.done`.

The `no-boolean-state-argument` rule warns when a boolean State is passed where a plain `boolean` is expected, since the receiving code will most likely test it: pass `!!+s.done` instead.

## State basics

The basis of Snapse is State objects. These tie together with Components and DOM elements.

### state: define a primary State

```typescript
function state<T>(value: T, name?: string | symbol): State<T>

```

The value can be any JS data type. One or more literal objects that group state is the suggested way to set up state for a Component, but individual State values can be freely created, extracted, recombined and passed around to functions and components.

Name is optional and can be a string or a Symbol. If specified, and the State is defined inside a Component, descendants of the Component can access it.

Plain object properties and array items of a State also automatically become State. In the example below, `s.toBuy[0]` is a State representing the string 'milk'.

<!-- snippet: stateBasics#state-def -->

### What should be in a State?

Snapse States are primarily intended for states that, when updated, will trigger changes in the DOM. While you can put anything you like in a State, and indeed it can be useful to do so, there are many cases where stateful variables are better kept outside of Snapse State.

For instance, suppose that your app creates entities with a unique id. You need a counter to keep track of the first available id - but updating that counter probably should not lead to visible changes in the DOM. In this case, putting the id in a State most likely serves no purpose and will only complicate your code.

### Function States: create chained (computed) States

Function States create chained (computed) States

Turning a function into a State and calling that function will in turn produce a new, _chained_ State. The chained State will be updated to reflect changes to any State used in its calculation, or to the function itself.

However, Snapse does not update chained States until the result is needed somewhere. This happens when the State, or any other State that depends on it, is inserted in the DOM, or when `subscribe` is called on the State or any State depending on it. This means that it is safe to create all the chained States you ever need in your application, and let Snapse keep track of what needs to be calculated.

<!-- snippet: stateBasics#function-state -->

### Promise States: update if the promise resolves

Creating a State with a promise, such as an async function, will result in a State that has the value `undefined` until the promise resolves. If the promise is rejected, the State will always remain undefined.

<!-- snippet: stateBasics#promise -->

### Custom objects

Custom objects are opaque to State. Internal changes to a custom object, even for publicly gettable and settable properties, will not cause reactive updates. Reactive updates will only be triggered if the custom object itself is replaced.

<!-- snippet: stateBasics#custom-object -->

## State functions

Snapse has a number of functions to handle States. Most code will not use these functions, with the exception of `compute`.

### compute: define computed (chained) States

```typescript
function compute<T>(fn: () => T): State<T>

```

The compute method is a convenient way to create a chained State by an anonymous function.

<!-- snippet: stateBasics#compute -->

### findState: find a named State in an ancestor component

```typescript
function findState<T>(name: string | symbol, defaultValue?: State<T>): State<T>

```

Use `findState` inside a component to retrieve a named State from the closest ancestor component that defines it. Note that by using a Symbol, you can limit access to components that know the value of that Symbol. If no State is found, `defaultValue` is returned if given. Otherwise, an Error is thrown. The application is responsible for ensuring that States retrieved using `findState` have the expected format.

<!-- snippet: stateBasics#findState -->

### peek: get the raw value of a State

```typescript
function peek<T>(value: T | State<T>): T

```

⚠️ **Note on Boolean Logic:** Because Snapse States are JavaScript objects under the hood, they are always truthy. `!s.flag` will always evaluate to `false`.

In most cases, you can use State objects transparently, because JavaScript automatically coerces them into primitives during string manipulation, math operations, or native method calls.

There are a few exceptions. If using the strict equality comparison (`===`) on a State, the object State itself will be compared for referential equality. This is always false, unless comparing the State to another reference to itself. It is recommended to cast the State explicitly to its type, eg `String(s.str) === 'approved'`. However, note that `Boolean(s.flag)` is always truthy - here, it is recommended to use `(!!+s.flag)`.

Standard array functions that take a boolean returning callback function (`every`, `filter`, `find`, `findIndex`, `findLast`, `findLastIndex` and `some`) automatically coerce a State value to boolean.

Using loose equality comparison (`==`) may or may not work depending on what types are being compared, and is discouraged.

The logical not operator: `!s.flag` is always `false`. Use `!+s.flag` instead.

Using `typeof` on a State will always return `function`. Use `typeof peek(s.value)`.

<!-- snippet: stateBasics#peek -->

*Avoid using `peek` unless necessary, and then only use it locally. Passing around or performing calculations with raw values from your States will probably result in more complex code - let Snapse handle your stateful logic. Many applications never need to use `peek` at all.*

Most imperative patterns have a direct reactive form:

* `peek(s.n) + 1` → `s.n + 1` (arithmetic, string and relational `<` / `>` comparisons coerce the State)
* `compute(() => peek(a) + peek(b))` → `compute(() => a + b)` (reference the States directly)
* `compute(() if (peek(a.flag)) return b)` → `a.flag.opt(b)`
* `if (peek(s.flag))` → `if (+s.flag)` (`+` coerces to integer, which is safe for booleans)
* `if (!peek(s.flag))` → `if (!+s.flag)`

### isState: check if something is a State

```typescript
function isState(value: any): boolean

```

You rarely need this in application code. Snapse usually handles State and raw values transparently, and you can use `peek()` when you need to guarantee a raw value.

<!-- snippet: stateBasics#isState -->

### flush: synchronously apply State changes

```typescript
function flush(state?: State<any>): void

```

Snapse processes State and DOM updates asynchronously. Use `flush()` to apply pending changes immediately. This is primarily intended for synchronous unit testing; avoid using it in application code.

<!-- snippet: stateBasics#flush -->

One exception is when performing a view transition: in this case, call `flush()` at the end of your `startViewTransition` callback to update the DOM synchronously.

<!-- snippet: stateBasics#view-transition -->

### subscribe: get notifications for State changes

```typescript
type SubscribeOptions = { deep?: boolean }

function subscribe<T>(
  state: State<T>,
  callback?: (value: State<T>) => void,
  options?: SubscribeOptions,
): () => void

```

Avoid setting other States in the callback, as that can result in unexpected update chains or even infinite loops. Most applications should not need to use `subscribe`.

Passing the `deep` option will make the callback fire also for updates to descendants of the State, through any plain objects and/or array children.

Calling the resulting unsubscribe function ends the subscription. If `subscribe` is called in a Component, it will be automatically unsubscribed when the Component is removed from the DOM.

<!-- snippet: stateBasics#subscribe -->

## Working with State

State variables can, with few exceptions (see `peek`), be used just like the values they contain.

### Assignment

Primary States can be reassigned to any value:

`s.myState = null`

Alternately, a setter function can be used for primitive State values and arrays (but not for object States).

`s.myState.set(null)`
This must also be used to modify a standalone or destructured State object, to avoid overwriting your reference:
`someState.set(null)`

### Object literal assignment

Assigning a non-state value to an object literal will create a new state.

<!-- snippet: stateBasics#new-object-property -->

Assigning an object literal key to an existing state creates a reference.

<!-- snippet: stateBasics#state-reference -->

To replace a reference to another state, the existing reference must first be explicitly deleted.

<!-- snippet: stateBasics#replace-state-reference -->

Assigning an object literal State to another object literal State will result in an upsert operation: existing State values will be updated (not replaced), and any new values will become new States.

<!-- snippet: stateBasics#computed-property -->

### Calling chain functions

We have seen how chained or derived States can be created using the `compute` function. Calling *any* chain function on a State will return a State - including for custom objects in a State. Any other States used in supplied callbacks will also be connected to the resulting State.

<!-- snippet: stateBasics#chain-filter -->

In the example, `s.filteredFruits` will be updated whenever the `s.fruits` array is updated, whenever any of its items are updated, and also whenever `s.filterString` is updated. The value of `s.customFilteredFruits` will also be updated whenever the `s.customFilter` *function* is updated.

The only exception to this rule is standard Array functions that modify the array, such as `.push`, `.sort`, `.splice`, etc, since such a State would serve no purpose.

### Serialising and deserialising

As long as a State only contains valid JSON values, a State can be serialized:

`JSON.stringify(s)`

Conversely, State can be initiated from stored JSON:

`state(JSON.parse(jsonString))`

### Awaiting State changes

Snapse States are thenables, which means it is possible to use `await` to halt code execution until the State changes value.

<!-- snippet: stateBasics#await -->

### State error handling

If the calculation of a chained state throws an error, it will result in a State that, when accessed, immediately re-throws that error. When the State is used in the DOM, it can be convenient to handle using the `.catch` function. However, if you want to detect State errors in other code, use a try ... catch.

<!-- snippet: stateBasics#try-catch -->

If a State is calculated using a function that makes it self-referential, directly or through a series of other computed States, its computation throws a `CircularDependencyError`.

<!-- snippet: stateBasics#circular -->

## State chain functions

Snapse defines a number of chain functions that can be more convenient to use than `compute` or a stateful function.

### .is: test for strict equality

```typescript
is(value: any): State<boolean>

```

The `.is` chain function checks a State for strict equality against another value, which may also be a State.

<!-- snippet: stateBasics#is -->

### .not: create an inverse State

```typescript
not(value: any): State<boolean>

```

Note that the result will be a State, not a boolean: see `peek` for how to compare boolean States. The .not chain function is useful when you need to pass an inverted State, for instance to a `disabled` DOM element attribute.

<!-- snippet: stateBasics#not -->

### .opt: select State values

```typescript
opt(options: any | any[] | Record<string, any> | State<any>, defaultValue?: any | State<any>): State<any>

```

Often, it is necessary to choose between two or more values, for instance when rendering a Component. The custom `.opt` chain function can simplify this. A ternary or `switch` statement inside a `compute` function can often do the same job, so it is a matter of convenience.

* If `options` is a primitive, it will be returned if the calling State is truthy. Otherwise, `defaultValue` will be returned (or `null` if not given).
* If `options` is an Array and the calling State evaluates to a number, or if `options` is an object literal, the value mapped to the State's current value (`options[stateValue]`) will be returned. If the key does not exist, `defaultValue` or `null` will be returned.

<!-- snippet: stateBasics#opt -->

This works the same way for a State that holds a DOM element or component, not just plain values:

<!-- snippet: stateBasics#opt-child -->

### .or: fallback for falsy values and empty arrays

```typescript
or(fallback: any): State<any>

```

The `.or` chain function creates a chained State which will be the original State if it is truthy or a non-empty array, otherwise a fallback value.

<!-- snippet: stateBasics#or -->

A State that may or may not hold a rendered element can use `.or` the same way, to fall back while it doesn't:

<!-- snippet: stateBasics#or-child -->

## DOM elements

In Snapse, the DOM tree is described using functions and values that represent elements and components. Elements and components are freely nested and mixed as children of one another.

<!-- snippet: components#composition -->

### element functions: create DOM elements

```typescript
type StyleValue = Record<string, string | State<string>> | State<any>
type ClassObject = Record<string, boolean | State<boolean>>
type ClassValue = string | ClassObject | ClassValue[] | State<any>

type EventListenerOptions = boolean | AddEventListenerOptions
type EventListenerValue = Function | [Function, EventListenerOptions] | State<any>

type AttributesAndEventListeners = {
  style?: StyleValue
  class?: ClassValue
  [key: string]: string | StyleValue | ClassValue | EventListenerValue | any
}

type ChildProp = Component | DOMElement | string | number | null | ChildProp[]
  | State<Component | DOMElement | string | number | null>

function element(attributesAndEventListeners?: AttributesAndEventListeners, ...children: ChildProp[]): DOMElement

```

Standard elements such as `div` and `span` are exported from `snapse/DOM`. Tag attributes are optionally specified in a plain object as the first argument to the function. The remaining arguments are treated as children.

Any attribute, child or argument can also be a State. In that case, Snapse will reactively update the DOM whenever the value of the State changes.

<!-- snippet: components#element-basic -->

### SVG elements

SVG element functions (`svg`, `circle`, `path`, …) are imported from `snapse/SVG`; their event handlers are typed with `SVGHandler`. Attributes and reactivity work exactly as for DOM elements. Some names (`a`, `script`, `style` and `title`) clash with DOM elements - use an import alias if you need both in the same file. When loading `snapse.js` directly in a web page, these SVG elements are named `svg_a`, `svg_script`, `svg_style` and `svg_title`.

<!-- snippet: components#svg -->

### Element attributes

Snapse passes on any attributes to the DOM element, including custom attributes for custom elements. A boolean attribute will be interpreted as set/unset.

<!-- snippet: components#element-attributes -->

### Attribute interpolation

To join a State with a string, pass an array as the attribute value. This works for whole attributes and for individual `style` values; any State among the elements keeps the result reactive.

<!-- snippet: components#attribute-interpolation -->

### Events

```typescript
type EventHandlerValue =
  | ((event: Event) => void)
  | [(event: Event) => void, EventListenerOptions]
  | State<any>

```

Snapse registers an attribute `xyz` as a listener for the `xyz` event when its value is a function, or a `[function, options]` tuple for `addEventListener` options such as `{ once: true }` or `{ capture: true }`.

<!-- snippet: components#click-event -->

#### Binding States to output

Passing a State as the handler is a convenient alternative to `ev => s.text.set(ev.target.value)`. Combined with a matching `value`, `checked` or `selected` attribute it gives output binding with no handler code - for text inputs, checkboxes, `select`, and any control whose event target carries the value.

<!-- snippet: components#output-binding -->

### The class attribute

For the `class` attribute, Snapse supports nesting classes using arrays, as well as setting classes conditionally using object notation (`ClassObject`):

<!-- snippet: components#class-nesting -->

### Element children

Children can be other elements, Snapse components, strings, numbers or `null` (which renders nothing). Arrays are automatically expanded. If the argument is a function, the function will be called and the result will be inserted. This allows creating lightweight 'anonymous components'.

<!-- snippet: components#reactive-children -->

A child can also be a State, used to imperatively switch the display.

<!-- snippet: components#swappable-child -->

### domElement: create a custom DOM element factory

```typescript
function domElement(tagName: string): (...args: any[]) => DOMElement

```

To use custom elements with Snapse, use `domElement` to create the corresponding element function.

<!-- snippet: components#dom-element -->

## Components

Snapse has two types of components: feature-rich proper Snapse components, and plain JS functions that are suitable for code refactoring without extra boilerplate.

### component: define Snapse components

```typescript
function component<P>(functionBody: (properties: P & { children?: ChildProp[] }) => ChildProp): Component

```

Once defined, components can be used just like DOM elements. In addition to any custom properties the caller submits, the component function body will receive the special `children` parameter containing any children nested when invoking the component. The function body will be called only once, when your component is created.

<!-- snippet: components#component -->

### async components: defer display

When the function body is an async function, the component will return `null` and display nothing until the function resolves. In an async component, calls to `state`, `findState` and `subscribe` must be placed before the first use of `await`, or an error will be thrown.

<!-- snippet: components#async-component -->

### .or: display a fallback

```typescript
or(fallback: ChildProp): Component

```

If a component can return `null`, typically as a State, or if it is an async component, it is possible to display a fallback.

<!-- snippet: components#component-or -->

The same fallback applies if you hold the component in a State.

<!-- snippet: components#component-or-via-state -->

### Function components: minimal boilerplate

In Snapse, any function is also a lightweight component. If the function needs no argument, it can just be added as a child.

<!-- snippet: components#function-component -->

This is useful for refactoring your DOM code to avoid excessive depth, with an absolute minimum of boilerplate.

If a function component needs arguments, it can be invoked using an anonymous function.

<!-- snippet: components#function-component-args -->

Note that if you simply call the function directly, it may also work - but this means your 'component' will be evaluated, and all its children will be created, at the time you define the parent component. While this is perfectly valid, the resulting behaviour can be counter-intuitive.

### .catch: handle errors

```typescript
type CatchFallbackFunction = (renderError: RenderError) => ChildProp
type CatchFallback = ChildProp | CatchFallbackFunction | State<CatchFallbackFunction>

catch(fallback: CatchFallback): this

```

Every element, component and `SnapseRoot` has a `.catch()` chain function. It catches errors thrown while building or updating its subtree - both during initial construction and during later reactive recomputation - and replaces the affected content with `fallback` instead of leaving it in a broken state. The fallback can be a plain child value, a Component, or a function (or `State` of one) that receives the `RenderError` and returns the replacement content.

<!-- snippet: components#catch-basic -->

If an error occurs beneath more than one `.catch()`, the nearest one wins. Outer `.catch()` calls are still notified of the error (a function fallback is invoked for any side effects), but their result is only mounted if the nearer fallback itself rendered nothing.

### RenderError: fine-grained error handling

```typescript
class RenderError extends Error {
  readonly cause: unknown
  readonly fallbackRendered: boolean
  readonly propagationStopped: boolean

  reset(): void
  stopPropagation(): void
}

```

The `RenderError` passed to a `.catch()` fallback carries the original error as `cause`. Calling `reset()` re-attempts the original render in place, replacing the fallback once it succeeds - this is the basis for "retry" buttons. A fallback that is itself a Component receives the `RenderError` as its `renderError` prop, rather than as a call argument.

<!-- snippet: components#render-error-reset -->

Calling `stopPropagation()` prevents any further, outer `.catch()` from being notified of the error at all.

<!-- snippet: components#render-error-stop-propagation -->

## SnapseRoot: bootstrap the Snapse application or add a 'portal'

```typescript
type RenderMode = 'hydrate' | 'csr'
type RootOptions = { root?: Node; mode?: RenderMode }

function SnapseRoot(options?: RootOptions, child?: ChildProp): void
function SnapseRoot(child: ChildProp): void

```

If no root is specified, Snapse will install at the end of `document.body`.

The available modes are:

* `hydrate`: attach event listeners and reactive State to existing DOM elements, then switch to `csr` mode
* `csr` (default): create DOM elements, install event listeners and reactive State

<!-- snippet: components#snapse-root -->

### Rendering a portal

If `SnapseRoot` is passed as a child of an element or component, its children will be rendered in the specified root, or at the end of `document.body`, creating a 'portal'. This subtree will be removed if the `SnapseRoot` component is removed.

<!-- snippet: components#portal -->

## Custom attributes & events

Snapse offers some custom attributes and event handlers.

### nodeCreated: notify on element creation

```typescript
nodeCreated?: (element: DOMElement) => void

```

The `nodeCreated` callback will fire as soon as the element has been created, before it is installed in the DOM.

<!-- snippet: components#node-created -->

### nodeInserted: notify on addition to DOM

```typescript
nodeInserted?: (element: DOMElement) => void

```

The `nodeInserted` callback will fire as soon as the element has been installed in the DOM.

<!-- snippet: components#node-inserted -->

### nodeRemoved: notify after removal from DOM

```typescript
nodeRemoved?: () => void

```

The handler is called just after the element has been removed. It receives no arguments.

<!-- snippet: components#node-removed -->

### innerHTML: insert raw HTML content

```typescript
innerHTML?: string

```

Inserting HTML creates a security risk, so it is important to use this feature only with trusted data, such as content received from a CMS system. A `DOMElement` can either have an `innerHTML` attribute or children, not both.

<!-- snippet: components#inner-html -->

### `null`: The do-nothing value

Snapse ignores ``null`` values as children, DOM Node properties, or event handlers. In order to deactivate something, create a State and set it to ``null`` to deactivate.

<!-- snippet: components#null-value -->

## Moving content

Snapse will move DOM elements using moveBefore when supported by the browser, preserving their internal state. Snapse will also move existing Snapse components when they are added using an array that sits directly in a DOM element.

<!-- snippet: moving#move-between-arrays -->

## Server-side rendering

```typescript
import { renderToString } from 'snapse/server'

function renderToString(...children: ChildProp[]): string

```

`renderToString` renders a tree to an HTML string. It runs anywhere JavaScript does: Node, Deno, Bun, or an edge worker.

```typescript
import { renderToString } from 'snapse/server'
import { component, state } from 'snapse'
import { button, div, span } from 'snapse/DOM'
```

<!-- snippet: server#counter -->

When a page containing the resulting string has been loaded in a browser, it can be hydrated using the *same* tree to `SnapseRoot` in `hydrate` mode to attach behavior to the elements:

<!-- snippet: server#hydrate -->

Snapse needs to mark the boundaries for dynamic content which is not bounded by an element. Therefore, you need to make sure that any minification preserves the Snapse boundary.
```
<!--𝒮-->
```

Note that the `SnapseRoot` component does not render anything when calling the `renderToString` function. Normally, it is used for elements that are hidden by default, and will be inserted with client side rendering. If you do want to render into multiple roots, you need to call `renderToString` for each tree separately in your server code, and initialize each case separately with `SnapseRoot` in the browser.

## Undo functionality

Snapse offers a powerful mechanism to support undo, redo and point-in-time restore features in your application with minimum effort.

### TrackHistory

```typescript
type TrackHistoryOptions = { limit?: number; addHistoryVersion?: () => number }
type HistoryEntry = { batch: ChangeRecord[]; t: number }

class TrackHistory<S extends State> {
  constructor(root: S, options?: TrackHistoryOptions)

  undo(): boolean
  redo(): boolean
  restoreAt(timestamp: number): void

  startBatch(): void
  commitBatch(): void

  getHistory(): HistoryEntry[]
  setHistory(history: HistoryEntry[]): void
  unsubscribe(): void

  undoEmpty: State<boolean>
  redoEmpty: State<boolean>
  historyVersions: State<number[]>
}

```

Construct it with the State you want tracked as `root`; this must be an object or array State. Every change to `root` or any of its descendants is recorded from then on. All changes applied between two flushes become a single history entry.

Options:

* `limit`: the maximum number of entries kept on the undo stack. Older entries are discarded.
* `addHistoryVersion`: called once per entry to produce its timestamp, default is `Date.now()`. Return a monotonically increasing number.

Members:

* `undo()` / `redo()`: step one entry back or forward. Each returns `false` if there was nothing to do. The tracked State is updated synchronously.
* `restoreAt(timestamp)`: move the tracked State to the point in time given by `timestamp`, undoing or redoing as many entries as needed in either direction.
* `startBatch()` / `commitBatch()`: collapse every change made between these calls, across any number of flushes, into a single undo entry. Committing with no changes recorded adds nothing.
* `getHistory()` / `setHistory(history)`: read the undo stack, or replace it, for persistence between sessions. `setHistory` also clears the redo stack.
* `unsubscribe()`: stop recording. Call this when the TrackHistory is no longer needed and was not created inside a Component.
* `undoEmpty` / `redoEmpty`: boolean States that track whether each stack is empty - wire them to the `disabled` attribute of undo/redo buttons.
* `historyVersions`: a State holding the array of entry timestamps, newest last - useful for rendering a history timeline for `restoreAt`.

<!-- snippet: trackHistory#trackhistory-basic -->

### Limitations of TrackHistory

While TrackHistory can be sufficient for many use cases, there are limitations you need to consider.

All the undoable application state needs to be in the tracked State, possibly including data that should not be directly displayed in the DOM. If your application data is very large, this may not be efficient.

TrackHistory does not support storing duplicated State. For example, the following is not supported:

<!-- snippet: trackHistory#trackhistory-duplicate -->

TrackHistory also does not support circular references among its children.

Finally, since TrackHistory is a highly generic implementation, it is always possible to design a more efficient implementation for your application, albeit at a much higher cost of development.

## Example

<!-- snippet: todo -->
