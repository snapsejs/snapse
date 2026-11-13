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

```typescript
import { SnapseRoot, state } from 'snapse'
import { button } from 'snapse/DOM'

const s = state({ count: 0 })

SnapseRoot(button({ click: () => s.count++ }, 'Clicked ', s.count, ' times'))
```

Start the dev server with `npm run dev`.

### Without a build step

Snapse can also be loaded directly in a web page, as a single JavaScript module that includes all elements. In this module, the SVG elements whose names clash with HTML elements are named `svg_a`, `svg_script`, `svg_style` and `svg_title`:

```html
<!doctype html>
<script type="module">
  import { SnapseRoot, button, state } from 'https://cdn.jsdelivr.net/npm/snapse/dist/snapse.js'

  const s = state({ count: 0 })

  SnapseRoot(button({ click: () => s.count++ }, 'Clicked ', s.count, ' times'))
</script>
```

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

```typescript
const s = state({
  listName: 'Groceries',
  toBuy: ['milk', 'tinfoil'],
  alreadyBought: ['jam', 'elephant'],
  locked: false,
  sortFunction: (a: string, b: string) => a.localeCompare(b),
}, 'shoppingListState')
```

### What should be in a State?

Snapse States are primarily intended for states that, when updated, will trigger changes in the DOM. While you can put anything you like in a State, and indeed it can be useful to do so, there are many cases where stateful variables are better kept outside of Snapse State.

For instance, suppose that your app creates entities with a unique id. You need a counter to keep track of the first available id - but updating that counter probably should not lead to visible changes in the DOM. In this case, putting the id in a State most likely serves no purpose and will only complicate your code.

### Function States: create chained (computed) States

Function States create chained (computed) States

Turning a function into a State and calling that function will in turn produce a new, _chained_ State. The chained State will be updated to reflect changes to any State used in its calculation, or to the function itself.

However, Snapse does not update chained States until the result is needed somewhere. This happens when the State, or any other State that depends on it, is inserted in the DOM, or when `subscribe` is called on the State or any State depending on it. This means that it is safe to create all the chained States you ever need in your application, and let Snapse keep track of what needs to be calculated.

```typescript
const s = state({
  width: 4,
  area: (height: number): number => s.width * height,
})

// Calling the function state produces a chained state that tracks width.
// It is not recalculated until it is rendered or subscribed to.
const area = s.area(7)
```

### Promise States: update if the promise resolves

Creating a State with a promise, such as an async function, will result in a State that has the value `undefined` until the promise resolves. If the promise is rejected, the State will always remain undefined.

```typescript
const s = state({ user: fetchUser() })
```

### Custom objects

Custom objects are opaque to State. Internal changes to a custom object, even for publicly gettable and settable properties, will not cause reactive updates. Reactive updates will only be triggered if the custom object itself is replaced.

```typescript
// The root reference can't be reassigned in place, so a state to be replaced wholesale
// is held as a property of a root state instead of being a root state itself.
const s = state({ v: { selection: new Set<string>(['a']) } })
const hasB = compute(() => s.v.selection.has('b'))

s.v.selection.add('b') // Does not update hasB
s.v = { selection: new Set(['b', 'c']) } as unknown as typeof s.v // Updates hasB
```

## State functions

Snapse has a number of functions to handle States. Most code will not use these functions, with the exception of `compute`.

### compute: define computed (chained) States

```typescript
function compute<T>(fn: () => T): State<T>

```

The compute method is a convenient way to create a chained State by an anonymous function.

```typescript
s.allItems = compute(() => [...s.toBuy, ...s.alreadyBought])
```

### findState: find a named State in an ancestor component

```typescript
function findState<T>(name: string | symbol, defaultValue?: State<T>): State<T>

```

Use `findState` inside a component to retrieve a named State from the closest ancestor component that defines it. Note that by using a Symbol, you can limit access to components that know the value of that Symbol. If no State is found, `defaultValue` is returned if given. Otherwise, an Error is thrown. The application is responsible for ensuring that States retrieved using `findState` have the expected format.

```typescript
const shoppingListState = findState<ShoppingListType>('shoppingListState')
```

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

```typescript
if (typeof peek(s.sortFunction) === 'function') doSomething()
```

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

```typescript
if (isState(propA)) console.log('Received propA as a State')
```

### flush: synchronously apply State changes

```typescript
function flush(state?: State<any>): void

```

Snapse processes State and DOM updates asynchronously. Use `flush()` to apply pending changes immediately. This is primarily intended for synchronous unit testing; avoid using it in application code.

```typescript
s.toBuy.push('snakes')
flush()
expect(String(s.allItems)).toBe('milk,tinfoil,snakes,jam,elephant')
```

One exception is when performing a view transition: in this case, call `flush()` at the end of your `startViewTransition` callback to update the DOM synchronously.

```typescript
startViewTransition(() => {
  s.locked.set(true)
  flush()
})
```

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

```typescript
subscribe(s.allItems, () => {
  localStorage.setItem('shoppingListItems', JSON.stringify(s.allItems))
})
```

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

```typescript
const s = state({
  dogs: 17,
})
s.cats = 19 // s.cats is now also a State
```

Assigning an object literal key to an existing state creates a reference.

```typescript
const s = state({
  productIds: [37, 42, 55],
})
s.selectedProduct = s.productIds[2] // Create a reference to a state
```

To replace a reference to another state, the existing reference must first be explicitly deleted.

```typescript
delete s.selectedProduct
s.selectedProduct = s.productIds[1]
```

Assigning an object literal State to another object literal State will result in an upsert operation: existing State values will be updated (not replaced), and any new values will become new States.

```typescript
const s = state({
  p: {
    priceBeforeTax: 5,
    taxRate: 0.2,
  },
})
s.p.priceAfterTax = compute(() => s.p.priceBeforeTax * (1 + s.p.taxRate))
// Assigning an object literal can only be done on a property of another object literal.
// It upserts: the existing values are updated in place (not replaced), so priceAfterTax
// stays connected and recomputes. New values are added.
s.p = { priceBeforeTax: 8, taxRate: 0.25, campaign: true } as State<{
  priceBeforeTax: number
  taxRate: number
  campaign: boolean
}>
```

### Calling chain functions

We have seen how chained or derived States can be created using the `compute` function. Calling *any* chain function on a State will return a State - including for custom objects in a State. Any other States used in supplied callbacks will also be connected to the resulting State.

```typescript
const s = state({
  fruits: ['banana', 'mango', 'blueberry', 'melon'],
  filterString: 'a',
  customFilter: (value: string) => value.includes('go'),
})
s.filteredFruits = s.fruits.filter(fruit => fruit.indexOf(s.filterString) >= 0)
s.customFilteredFruits = s.fruits.filter(s.customFilter)
```

In the example, `s.filteredFruits` will be updated whenever the `s.fruits` array is updated, whenever any of its items are updated, and also whenever `s.filterString` is updated. The value of `s.customFilteredFruits` will also be updated whenever the `s.customFilter` *function* is updated.

The only exception to this rule is standard Array functions that modify the array, such as `.push`, `.sort`, `.splice`, etc, since such a State would serve no purpose.

### Serialising and deserialising

As long as a State only contains valid JSON values, a State can be serialized:

`JSON.stringify(s)`

Conversely, State can be initiated from stored JSON:

`state(JSON.parse(jsonString))`

### Awaiting State changes

Snapse States are thenables, which means it is possible to use `await` to halt code execution until the State changes value.

```typescript
s.confirmDialogOpen.set(true)
await s.confirmDialogResponse
if (String(s.confirmDialogResponse) !== 'confirmed') return
```

### State error handling

If the calculation of a chained state throws an error, it will result in a State that, when accessed, immediately re-throws that error. When the State is used in the DOM, it can be convenient to handle using the `.catch` function. However, if you want to detect State errors in other code, use a try ... catch.

```typescript
const total = compute(() => {
  if (+s.locked) throw new Error('order total unavailable while locked')
  return s.price * s.quantity
})

let message = ''
try {
  String(total)
} catch (e) {
  message = (e as Error).message
}
```

If a State is calculated using a function that makes it self-referential, directly or through a series of other computed States, its computation throws a `CircularDependencyError`.

```typescript
const s = state<number[]>([])
const next = compute(() => s[0]! + 1)
s.push(next)

const display = div(next).catch('circular dependency')
```

## State chain functions

Snapse defines a number of chain functions that can be more convenient to use than `compute` or a stateful function.

### .is: test for strict equality

```typescript
is(value: any): State<boolean>

```

The `.is` chain function checks a State for strict equality against another value, which may also be a State.

```typescript
const isSelected = s.selectedRowId.is(currentRow.id)
```

### .not: create an inverse State

```typescript
not(value: any): State<boolean>

```

Note that the result will be a State, not a boolean: see `peek` for how to compare boolean States. The .not chain function is useful when you need to pass an inverted State, for instance to a `disabled` DOM element attribute.

```typescript
input({ disabled: s.locked.not() })
```

### .opt: select State values

```typescript
opt(options: any | any[] | Record<string, any> | State<any>, defaultValue?: any | State<any>): State<any>

```

Often, it is necessary to choose between two or more values, for instance when rendering a Component. The custom `.opt` chain function can simplify this. A ternary or `switch` statement inside a `compute` function can often do the same job, so it is a matter of convenience.

* If `options` is a primitive, it will be returned if the calling State is truthy. Otherwise, `defaultValue` will be returned (or `null` if not given).
* If `options` is an Array and the calling State evaluates to a number, or if `options` is an object literal, the value mapped to the State's current value (`options[stateValue]`) will be returned. If the key does not exist, `defaultValue` or `null` will be returned.

```typescript
s.locked.opt(LockIcon())
s.selectedIndex.opt(s.data, 'Nothing selected')
```

This works the same way for a State that holds a DOM element or component, not just plain values:

```typescript
const selected = state<DOMChild>(null)
const checkmark = selected.opt(CheckIcon())
```

### .or: fallback for falsy values and empty arrays

```typescript
or(fallback: any): State<any>

```

The `.or` chain function creates a chained State which will be the original State if it is truthy or a non-empty array, otherwise a fallback value.

```typescript
return s.listItems.or('List is empty')
```

A State that may or may not hold a rendered element can use `.or` the same way, to fall back while it doesn't:

```typescript
const selected = state<DOMChild>(null)
const display = selected.or(div('Nothing selected'))
```

## DOM elements

In Snapse, the DOM tree is described using functions and values that represent elements and components. Elements and components are freely nested and mixed as children of one another.

```typescript
const MainComponent = component(() => div({ class: 'main' }, 'Main content'))
type FooterProps = { size: string, children: ChildProp[] }
const Footer = component(({ size, children }: FooterProps) =>
  div({ class: `footer-${size}` }, children))

const page = div({ class: 'page' },
  MainComponent,
  Footer({ size: 'large' },
    'Snapse example',
  ),
)
```

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

```typescript
div({ id: 'greeting', class: 'banner' }, 'Hello, ', s.name, '!')
```

### SVG elements

SVG element functions (`svg`, `circle`, `path`, …) are imported from `snapse/SVG`; their event handlers are typed with `SVGHandler`. Attributes and reactivity work exactly as for DOM elements. Some names (`a`, `script`, `style` and `title`) clash with DOM elements - use an import alias if you need both in the same file. When loading `snapse.js` directly in a web page, these SVG elements are named `svg_a`, `svg_script`, `svg_style` and `svg_title`.

```typescript
// SVG element functions come from snapse/SVG; they work like DOM elements.
svg({ viewBox: '0 0 100 100', width: 100 },
  circle({ cx: 50, cy: 50, r: 40, fill: 'tomato' }))
```

### Element attributes

Snapse passes on any attributes to the DOM element, including custom attributes for custom elements. A boolean attribute will be interpreted as set/unset.

```typescript
// A boolean attribute is rendered when truthy and omitted when falsy; both plain
// and reactive values are accepted, as is any custom attribute.
input({ type: 'text', required: true, disabled: s.busy, 'data-role': 'title' })
```

### Attribute interpolation

To join a State with a string, pass an array as the attribute value. This works for whole attributes and for individual `style` values; any State among the elements keeps the result reactive.

```typescript
// Arrays are joined into one value; a State among them keeps it reactive.
const box = div({ id: 'sidebar', style: { width: [s.width, 'px'] } })
```

### Events

```typescript
type EventHandlerValue =
  | ((event: Event) => void)
  | [(event: Event) => void, EventListenerOptions]
  | State<any>

```

Snapse registers an attribute `xyz` as a listener for the `xyz` event when its value is a function, or a `[function, options]` tuple for `addEventListener` options such as `{ once: true }` or `{ capture: true }`.

```typescript
const s = state({ clicks: 0 })
// const countClick = () => s.clicks++
const counter = button({ click: () => s.clicks++ }, 'Clicked ', s.clicks, ' times')
```

#### Binding States to output

Passing a State as the handler is a convenient alternative to `ev => s.text.set(ev.target.value)`. Combined with a matching `value`, `checked` or `selected` attribute it gives output binding with no handler code - for text inputs, checkboxes, `select`, and any control whose event target carries the value.

```typescript
const s = state({ name: '', agreed: false, size: 'M' })
// Passing s.name (a State) is equivalent to `ev => s.name.set(ev.target.value)`.
div(
  input({ value: s.name, input: s.name }),
  input({ type: 'checkbox', checked: s.agreed, change: s.agreed }),
  select({ value: s.size, change: s.size },
    option({ value: 'S' }, 'Small'),
    option({ value: 'M' }, 'Medium')),
)
```

### The class attribute

For the `class` attribute, Snapse supports nesting classes using arrays, as well as setting classes conditionally using object notation (`ClassObject`):

```typescript
div(
  {
    class: [
      'standard-div',
      s.customClass,
      {
        'special-div': s.isSpecial,
      },
    ],
  },
  content,
)
```

### Element children

Children can be other elements, Snapse components, strings, numbers or `null` (which renders nothing). Arrays are automatically expanded. If the argument is a function, the function will be called and the result will be inserted. This allows creating lightweight 'anonymous components'.

```typescript
const s = state({
  background: 'red',
  buttonText: 'Ok',
})
div({ style: { background: s.background } },
  button({ click: () => alert('Clicked') }, s.buttonText))
```

A child can also be a State, used to imperatively switch the display.

```typescript
const view = state<DOMChild>(null)
const showWelcome = () => view.set(div('Welcome!'))
const showProfile = () => view.set(div({ class: 'profile' }, 'Your profile'))
const app = div({ id: 'app' }, view)
```

### domElement: create a custom DOM element factory

```typescript
function domElement(tagName: string): (...args: any[]) => DOMElement

```

To use custom elements with Snapse, use `domElement` to create the corresponding element function.

```typescript
const specialElement = domElement('special-element')

specialElement({ excel: true, prevaricate: 'maybe' },
  div('Excellent child'))
```

## Components

Snapse has two types of components: feature-rich proper Snapse components, and plain JS functions that are suitable for code refactoring without extra boilerplate.

### component: define Snapse components

```typescript
function component<P>(functionBody: (properties: P & { children?: ChildProp[] }) => ChildProp): Component

```

Once defined, components can be used just like DOM elements. In addition to any custom properties the caller submits, the component function body will receive the special `children` parameter containing any children nested when invoking the component. The function body will be called only once, when your component is created.

```typescript
const SearchableTable = component(({ rowData }: { rowData: State<string[][]> }) => {
  const query = state('')
  const filterFunction = (row: State<string[]>) => row.some(cell => cell.includes(query))

  return div(
    table(
      tbody(
        rowData.filter(filterFunction)
          .map((row: string[]) => tr(
            row.map((cellData: string) => td(cellData)),
          )),
      ),
      tfoot(
        tr(td(input({ change: query }))),
      ),
    ),
  )
})
```

### async components: defer display

When the function body is an async function, the component will return `null` and display nothing until the function resolves. In an async component, calls to `state`, `findState` and `subscribe` must be placed before the first use of `await`, or an error will be thrown.

```typescript
const UserCard = component(async () => {
  const user = await loadUser()
  return div({ class: 'card' }, user.name)
})
```

### .or: display a fallback

```typescript
or(fallback: ChildProp): Component

```

If a component can return `null`, typically as a State, or if it is an async component, it is possible to display a fallback.

```typescript
const page = div(UserCard().or('Loading...'))
```

The same fallback applies if you hold the component in a State.

```typescript
const view = state(UserCard()).or('Loading...')
const page = div(view)
```

### Function components: minimal boilerplate

In Snapse, any function is also a lightweight component. If the function needs no argument, it can just be added as a child.

```typescript
const simpleComponent = () => div('example text')
const page = div(simpleComponent)
```

This is useful for refactoring your DOM code to avoid excessive depth, with an absolute minimum of boilerplate.

If a function component needs arguments, it can be invoked using an anonymous function.

```typescript
const argumentComponent = (n: number) => div('the answer is ', n)
const page = div(() => argumentComponent(42))
```

Note that if you simply call the function directly, it may also work - but this means your 'component' will be evaluated, and all its children will be created, at the time you define the parent component. While this is perfectly valid, the resulting behaviour can be counter-intuitive.

### .catch: handle errors

```typescript
type CatchFallbackFunction = (renderError: RenderError) => ChildProp
type CatchFallback = ChildProp | CatchFallbackFunction | State<CatchFallbackFunction>

catch(fallback: CatchFallback): this

```

Every element, component and `SnapseRoot` has a `.catch()` chain function. It catches errors thrown while building or updating its subtree - both during initial construction and during later reactive recomputation - and replaces the affected content with `fallback` instead of leaving it in a broken state. The fallback can be a plain child value, a Component, or a function (or `State` of one) that receives the `RenderError` and returns the replacement content.

```typescript
const Weather = component(() => {
  throw new Error('forecast service unavailable')
})

const page = div(Weather().catch('Unable to load weather'))
```

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

```typescript
let widgetBroken = true
const FlakyWidget = component(() => {
  if (widgetBroken) throw new Error('widget crashed')
  return div('widget ok')
})

const Fallback = component(({ renderError }) => div(
  'Failed: ',
  (renderError!.cause as Error).message,
  ' ',
  button({ click: () => renderError!.reset() }, 'Retry'),
))

const page = div(FlakyWidget().catch(Fallback()))
```

Calling `stopPropagation()` prevents any further, outer `.catch()` from being notified of the error at all.

```typescript
let outerNotified = false
const Throwing = component(() => {
  throw new Error('boom')
})

const Inner = component(() => Throwing().catch(e => {
  e.stopPropagation() // Prevents the outer .catch() below from also being notified.
  return 'inner handled'
}))

const page = div(Inner().catch(() => {
  outerNotified = true
  return 'outer handled'
}))
```

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

```typescript
SnapseRoot(MyComponent)
```

### Rendering a portal

If `SnapseRoot` is passed as a child of an element or component, its children will be rendered in the specified root, or at the end of `document.body`, creating a 'portal'. This subtree will be removed if the `SnapseRoot` component is removed.

```typescript
const Dialog = component(() => SnapseRoot(
  { root: document.getElementById('modal-root') },
  div({ class: 'dialog' }, 'Saved!'),
))

const Page = component(() => div('Page content', s.dialogOpen.opt(Dialog)))
```

## Custom attributes & events

Snapse offers some custom attributes and event handlers.

### nodeCreated: notify on element creation

```typescript
nodeCreated?: (element: DOMElement) => void

```

The `nodeCreated` callback will fire as soon as the element has been created, before it is installed in the DOM.

```typescript
div({ nodeCreated: (element: { target?: HTMLElement }) => console.log(element) })
```

### nodeInserted: notify on addition to DOM

```typescript
nodeInserted?: (element: DOMElement) => void

```

The `nodeInserted` callback will fire as soon as the element has been installed in the DOM.

```typescript
div({ nodeInserted: (element: { target?: HTMLElement }) => console.log(element) })
```

### nodeRemoved: notify after removal from DOM

```typescript
nodeRemoved?: () => void

```

The handler is called just after the element has been removed. It receives no arguments.

```typescript
div({ nodeRemoved: () => console.log('Element was removed') })
```

### innerHTML: insert raw HTML content

```typescript
innerHTML?: string

```

Inserting HTML creates a security risk, so it is important to use this feature only with trusted data, such as content received from a CMS system. A `DOMElement` can either have an `innerHTML` attribute or children, not both.

```typescript
div({ innerHTML: 'Some text with <em>markup</em>.' })
```

### `null`: The do-nothing value

Snapse ignores ``null`` values as children, DOM Node properties, or event handlers. In order to deactivate something, create a State and set it to ``null`` to deactivate.

```typescript
SnapseRoot(component(() => {
  const s = state({
    disabled: false,
    onClick: (() => {
      console.log('clicked, disabling')
      s.disabled.set(true)
      s.onClick.set(null)
    }) as (() => void) | null,
  })
  const onMouseOver = s.disabled.opt(() => console.log('mouse over'))

  return button({ disabled: s.disabled, click: s.onClick, mouseover: onMouseOver })
})())
```

## Moving content

Snapse will move DOM elements using moveBefore when supported by the browser, preserving their internal state. Snapse will also move existing Snapse components when they are added using an array that sits directly in a DOM element.

```typescript
const Greeting = component(() => div({ class: 'greeting' }, 'Hello from a component'))

const left = state<DOMChild[]>([input({ placeholder: 'Type here' }), Greeting()])
const right = state<DOMChild[]>([])

const moveRight = () => right.push(...left.splice(0))

const page = div(
  div({ class: 'left' }, left),
  div({ class: 'right' }, right),
  button({ click: moveRight }, 'Move'),
)
```

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

```typescript
const Counter = component(() => {
  const s = state({ count: 41 })
  return div(span(s.count), button({ click: () => s.count++ }, 'Count'))
})

const html = renderToString(Counter())
```

When a page containing the resulting string has been loaded in a browser, it can be hydrated using the *same* tree to `SnapseRoot` in `hydrate` mode to attach behavior to the elements:

```typescript
SnapseRoot({ mode: 'hydrate' }, Counter())
```

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

```typescript
const Counter = component(() => {
  const s = state({ count: 0 })
  const history = new TrackHistory(s)

  return div(
    output(s.count),
    button({ click: () => s.count.set(s.count + 1) }, 'Increment'),
    button({ click: history.undo, disabled: history.undoEmpty }, 'Undo'),
    button({ click: history.redo, disabled: history.redoEmpty }, 'Redo'),
  )
})
```

### Limitations of TrackHistory

While TrackHistory can be sufficient for many use cases, there are limitations you need to consider.

All the undoable application state needs to be in the tracked State, possibly including data that should not be directly displayed in the DOM. If your application data is very large, this may not be efficient.

TrackHistory does not support storing duplicated State. For example, the following is not supported:

```typescript
// NOT supported: selectedItem now holds the very same State that also lives in
// items, so TrackHistory sees one child stored in two places and cannot track it.
board.selectedItem.set([board.items[42]!])
```

TrackHistory also does not support circular references among its children.

Finally, since TrackHistory is a highly generic implementation, it is always possible to design a more efficient implementation for your application, albeit at a much higher cost of development.

## Example

```typescript
import { SnapseRoot, type State, component, findState, flush, state, subscribe }
  from 'snapse'
import { type ChildProp, type DOMHandler, button, div, h2, input, output, span }
  from 'snapse/DOM'
import cl from './styles.module.css'

type TodoItem = State<{ id: number, checked: boolean, text: string }>
type TodoListState = State<{
  items: TodoItem[]
  query: string
  selected: number
}>

export const TodoList = component(() => {
  const s = state<TodoListState>({
    items: JSON.parse(localStorage.getItem('ToDo') ?? '[]'),
    query: '',
    selected: 0,
  }, 'TodoList')
  let nextId = Number(s.items.reduce((max, item) => Math.max(max, item.id), 0))
  subscribe(s.items,
    () => localStorage.setItem('ToDo', JSON.stringify(s.items)),
    { deep: true })
  const addTodo: DOMHandler<'change'> = ev => {
    s.items.push({ id: ++nextId, checked: false, text: ev.target.value } as TodoItem)
    ev.target.value = ''
  }
  const matchingItems = s.items.filter(item => String(item.text).includes(s.query))
  const itemComponents = matchingItems.map(todoItem => Todo({ todoItem })
    .or(div({ class: cl.item }, 'Creating...')))

  return div({ class: cl.app },
    div({ class: cl.lists },
      div(
        h2('To do'),
        itemComponents.filter((_item, i) => matchingItems[i]!.checked.not())
          .or(output(s.query.opt(["No match for '", s.query, "'"], 'Nothing to do'))),
      ),
      div({ class: cl.done },
        h2('Done'),
        itemComponents.filter((_item, i) => matchingItems[i]!.checked)
          .or(output(s.query.opt(["No match for '", s.query, "'"], 'Nothing finished'))),
      ),
      input({ class: cl.search, type: 'search', placeholder: 'Search', input: s.query }),
    ),
    div(input({ class: cl.add, placeholder: 'Add todo', change: addTodo })),
  )
})

const startViewTransition = document.startViewTransition?.bind(document)
  ?? ((f: Function) => f())
type TodoItemProps = { todoItem: TodoItem }
const Todo = component(async ({ todoItem }: TodoItemProps) => {
  const s: TodoListState = findState('TodoList')
  const handleCheck: DOMHandler<'change'> = ev => startViewTransition(() => {
    todoItem.checked.set(ev.target.checked)
    flush()
  })
  await new Promise(r => setTimeout(r, 300 + Math.random() * 700)) // Make it expensive

  return div({ class: cl.item, style: { viewTransitionName: `item${todoItem.id}` } },
    input({ type: 'checkbox', checked: todoItem.checked, change: handleCheck }),
    s.selected.is(todoItem.id).opt(
      ItemEditor({ todoItem, todoListState: s }),
      span({ click: () => s.selected.set(todoItem.id) },
        HighlightedText({ text: todoItem.text, highlight: s.query }),
      ),
    ),
  )
})

type ItemEditorProps = { todoItem: TodoItem, todoListState: TodoListState }
const ItemEditor = component(({ todoItem, todoListState: s }: ItemEditorProps) => {
  const updateTodoText: DOMHandler<'change'> = ev => {
    todoItem.text.set(ev.target.value)
    s.selected.set(0)
  }
  const deleteTodo = () => s.items.splice(s.items.indexOf(todoItem), 1)

  return [
    input({ value: todoItem.text, change: updateTodoText, blur: updateTodoText,
      nodeInserted: ev => ev.target?.focus() }),
    button({ class: cl.delete, mousedown: deleteTodo }),
  ]
})

type HighLightedTextProps = State<{ text: string, highlight: string }>
const HighlightedText = component(({ text, highlight }: HighLightedTextProps) =>
  text.split(highlight.or(undefined) as string)
    .reduce((acc, fragment, i) => i
      ? [...acc, span({ class: cl.highlight }, highlight), fragment]
      : [fragment], [] as (string | ChildProp)[]),
)

SnapseRoot(TodoList())
```
