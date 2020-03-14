# rippleware
A middleware-inspired toolbox which enables you to design fully customizable functions.

<a href="#badge">
    <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"></a>

#### 🌠 tl;dr
It's like a [Factory Pattern](https://www.dofactory.com/javascript/factory-method-design-pattern) for arbitrary sequences of data manipulation. You can think of it as like [express](https://www.npmjs.com/package/express) for computation.

## 🔥 Features
  - Deeply configurable, user-extensible function definitions.
    - Design arbitrarily long sequences of data manipulation.
    - Define multiple routes based on [`type-check`](https://www.npmjs.com/package/type-check) rigorous declaration syntax.
  - Using hooks, you can persist and react to dynamics.
    - You can cache and respond to middleware results from previous executions.
  - A friendly interface. 👋
    - If you know [middleware](https://expressjs.com/en/guide/writing-middleware.html), then you know rippleware.
    - Intuitive indexing enables simple operation on deeply-nested propagated data.

## 🚀 Getting Started

Using [`npm`]():

```bash
npm install --save rippleware
```

Using [`yarn`]():

```bash
yarn add rippleware
```

### Breaking Changes

#### 0.2.0-alpha.0
A number of breaking changes have been introduced to this version, which greatly reduced the size of the compiled library, placed greater emphasis on the formality of definition rules and conventions surrounding data propagation and term aggregation. In addition, it's far easier to define handler functions.

One of the most important aspects of rippleware is now _channel information is preserved_; this means that calls that use scalar values will always return using an array, where each element reflects the individual channel data.

##### Handler Definitions

Instead of defining a match all handler, you can just define the function directly:

```diff
import compose from "rippleware";

const app = compose()
+  .use(input => !input);
-  .use('*', input => !input);

await app(true); // [false];
```

If you still want to take different actions dependent upon the shape of input data, you can define multiple handler routes using an array of type checkers, which improves readability and emphasises the precendence of declared checkers:

```diff
import compose from "rippleware";

const app = compose()
+  .use(
+    [
+      ['[Number]', () => 'Array of numbers!'],
+      ['*', () => 'Something else'],
+    ],
+  );
-  .use(handle => {
-    handle('[Number]', () => 'Array of numbers!');
-    handle('*', () => 'Something else!');
-  });
```

#### 0.1.0-alpha.0
Rippleware no longer relies upon [deasync](https://www.npmjs.com/package/deasync) to force sequential execution. Now by default, all invocations are asynchronous, and no instanation options are permitted to be specified:

```diff
import compose from "rippleware";

+ const app = compose().use("*", () => null);
- const app = compose({ sync: true }).use("*", () => null);

+ const result = await(app());
- const result = app();
```

## 👀 Overview

### 📖 Table of Contents
- [Hello, world!](https://github.com/cawfree/rippleware#1-hello-world)
- [Routing](https://github.com/cawfree/rippleware#2-routing)
- [Indexing](https://github.com/cawfree/rippleware#3-indexing)
  - [Array Indexing](https://github.com/cawfree/rippleware#31-array-indexing)
  - [Object Indexing](https://github.com/cawfree/rippleware#32-object-indexing)
- [Hooks](https://github.com/cawfree/rippleware#4-hooks)
  - [`useGlobal`](https://github.com/cawfree/rippleware#41-useglobal)
  - [`useMeta`](https://github.com/cawfree/rippleware#42-usemeta)
  - [`useTopology`](https://github.com/cawfree/rippleware#43-usetopology)
- [Nesting](https://github.com/cawfree/rippleware#5-nesting)

### 1. Hello, world!

The only entity that is exported from rippleware is `compose`, which we can `use()` to define each step in our function:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(() => "Hello, world!");

console.log(await app()); // ["Hello, world!"]
```

You can also declare handlers for specific data types; for example, this algorithm will only work on numbers, and will otherwise _throw_.

```javascript
import compose from 'rippleware';

const app = compose()
  .use([['Number', i => i + 1]]);

console.log(await app(2)); // [3]
await app("3"); // throws
```

### 2. Routing

You can make multiple calls to `handle` within a single middleware; these define the different operations that can be performed based upon the shape of the input data. Since each handler is compared against in the order they were defined, care should be taken to ensure that multiple handler allocations should use increasingly generalized checkers.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    [
      ["String", () => "You passed a string!"],
      ["*", () => "You didn't pass a string!"],
    ],
  );

console.log(await app('This is a string.')) // ["You passed a string!"]
console.log(await app({ life: 42 })) // ["You didn't pass a string!"]
```

You don't have to define routes just based on strict type checking. You can just as easily define a **matcher function**:

```javascript
const app = compose()
  .use(
    [
      [i => (typeof i) === 'string', () => "You passed a string!"],
      [i => (typeof i) !== 'string', () => "You didn't pass a string!"],
    ],
  );
```

If a valid route is not found, the incompatible `.use()` stage will throw and prevent subsequent stages from being executed for the active invocation.

### 3. Indexing

#### 3.1 Array Aggregation

It is possible to aggregate multiple operations over a single channel of execution.

```javascript
import compose from 'rippleware';

const addOneToANumber = () => i => i + 1;

const app = compose()
  .use([addOneToANumber(), addOneToANumber()], addOneToANumber());
  
console.log(await app(1, 2)); // [[2, 2], 3]
```

Notice how the first channel of execution has defined two results for the single scalar input.


#### 3.2 Object Indexing

In addition, it's possible to filter specific properties of a given object by supplying a [regular expression](https://www.w3schools.com/js/js_regexp.asp). The regular expression must be expressed in a form compatible with [`jsonpath`](https://www.npmjs.com/package/jsonpath). Below, we use a call to `sep()` instead of `use()` to alter the format of the arguments returned by the call.

```javascript
import compose from 'rippleware';

const app = compose()
  .sep(/$.*.t/);

console.log(await app([{t: 'hi'}, {t: 'bye'}])); // ['hi', 'bye']
```

In addition, you can apply these expressions to multiple arguments:

```javascript
import compose from 'rippleware';

const app = compose()
  .sep(/$.*.t/, /$.*.s/);

console.log(await app([{t: 'hi'}], [{s: 0}])); // [['hi'], [0]]
```

Alternatively, you can choose to aggregate multiple indexes over a single parameter:

```javascript
import compose from 'rippleware';

const app = compose()
  .use([/$.*.t/, /$.*.s/]);

console.log(await app([{t: 'hi', s: 0}, {t: 'bye', s: 1}])); // [['hi', 'bye'], [0, 1]]
```

### 4. Hooks

It's possible to take advantage of [React](https://reactjs.org/)-inspired [hooks](https://reactjs.org/docs/hooks-intro.html) inside of your middleware functions. In the example below, we cache props from the first invocation and rely return this forever after.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    (nextProps, { useState }) => {
        const [state] = useState(() => nextProps);
        return state;
      }
  );

await app('The only value this will ever return.'); // ["The only value this will ever return."]
await app('Some other value')); // ["The only value this will ever return."]
```

#### 4.1 `useGlobal`

The `useGlobal` hook enables middleware to take advantage of function-global state operations. These are useful for implementing the storage of data and functionality which underpins the operation of multiple middleware steps.

> By default, there is *no* global state configured, and therefore calls to `useGlobal` will return `undefined`.

A simple example of global function state is depicted in the example below, where we allocate a new rippleware whose global state was initialized to a _mutable_ object with the child value, `value`.

```javascript
import compose from 'rippleware';

const app = compose(() => ({ value: 0 }))
  .use((_, { useGlobal }) => useGlobal().value += 1)
  .use((_, { useGlobal }) => useGlobal().value);

await app(); // [1]
await app(); // [2]
await app(); // [3]
```

Obviously, [mutable state sucks, and must be avoided.](https://hackernoon.com/mutability-leads-to-suffering-23671a0def6a)

In the example below, we can show that it's possible to utilize mature state management libraries such as [Redux](https://github.com/reduxjs/redux):

```javascript
import compose from 'rippleware';
import { Map } from 'immutable';
import { createStore } from 'redux';

const INCREMENT = 'reducer/INCREMENT';
const increment = () => ({ type: INCREMENT });

const buildStore = () => {
  const initialState = Map({ value: 0 });
  const reducer = (state = initialState, { type, ...extras }) => {
    switch (type) {
      case INCREMENT:
        return state.set('value', state.get('value') + 1);
      default:
        return state;
    }
  };
  return createStore(reducer);
};

const app = compose(buildStore)
  .use((_, { useGlobal }) => {
    const { dispatch } = useGlobal();
    dispatch(increment());
  })
  .use((_, { useGlobal }) => useGlobal().getState().get('value'));

await app(); // [1]
await app(); // [2]
await app(); // [3]
```

This will lead to far less bugs, and greatly less scope for misuse!

#### 4.2 `useMeta`

It is possible for middleware functions supplied using calls to `use()` to actually return _two_ kinds of data. There's the conventional result, which you'd expect the caller to see, and there's the _meta_, which you'd expect subsequent middleware stages to interrogate.

This functionality permits functions to return using traditional data types and conventions that would be expected from by an external, non-rippleware-oriented caller. Meanwhile, it is possible to empower neighbouring middleware stages with deeper execution context that we wouldn't necessarily want to burden the caller with.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    (input, { useMeta }) => {
      useMeta({ type: 'incrementer', desc: 'Adds one to a number!' });
      return input + 1;
    },
  )
  .use(
    (input, { useMeta }) => {
      const { type } = useMeta(); // 'incrementer'
      return input;
    },
  );

await app(1); // [2]
```

#### 4.3 `useTopology`
The `useTopology` hook can be used to determine your middleware's position within the function cascade. This can be useful to perform conditional functionality dependent upon your middleware's locality of execution:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(b => !b)
  .use(b => !b)
  .use((_, { useTopology }) => useTopology())
  .use(b => b)

await app(); // [[2, 4]] (i.e. index #2 of a total 4 layers)
```

Note that a call to `useTopology` is _insular_, and only refers to the middleware position within the owning cascade:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(b => !b)
  .use(
    compose()
      .use((_, { useTopology }) => useTopology()),
  )
  .use(b => !b);

await app(); // [[0, 1]] (index #0 in the nested single-layer rippleware)
```

### 5. Nesting
It's also possible to _nest_ rippleware within middleware layers. Check the example below:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    compose()
      .use(b => !b),
  );

await app(true); // [false]
```

This allows all input data, irrespective of routing, into the nested middleware. To permit data indexing, nested middleware components can also be stacked horizontally:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    compose().use(b => !b),
    compose().use(b => Promise.resolve(!b)),
  );

await app(true, false); // [false, true]
```

## 😎 Contributing

This is an active project, and your contributes are welcome! Before submitting any [Pull Requests](https://github.com/cawfree/rippleware/pulls), please ensure all existing unit tests pass with a call to `yarn jest`.

## ✌️ License
[MIT](https://opensource.org/licenses/MIT)

<p align="center">
  <a href="https://www.buymeacoffee.com/cawfree">
    <img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy @cawfree a coffee" width="232" height="50" />
  </a>
</p>
