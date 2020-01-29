import '@babel/polyfill';

import compose from '../src';

const addTwo = () => handle => handle(
  '[Number]', (next, last) => {
    return next.map(e => (e + 2));
  },
);

const returnAConstant = () => handle => handle(
  '*', (next, last) => [
    1,
    2,
    [3],
  ],
);

const somethingThatAddsOneToAScalar = () => handle => handle(
  'Number', (next, last) => (next + 1),
);

const retainState = () => handle => handle(
  '*', (next, last) => last || next,
);

it('should define a composable structure', async () => {
  const app = compose()
    .use(returnAConstant());
  const res = await app();
  expect(res).toEqual([1, 2, [3]]);
});

it('should export an argument filtering/indexing interface', async () => {

  const app = compose()
    .use(addTwo(), addTwo())
    .use(addTwo(), addTwo())
    .use(returnAConstant())
    .use(
      [somethingThatAddsOneToAScalar()],
      [somethingThatAddsOneToAScalar()],
      [[somethingThatAddsOneToAScalar()]],
    );

  const result = await app([2], [2]);

  expect(result)
    .toEqual([2, 3, 4]);
});

it('should permit middleware to retain state between executions', async () => {
  const app = compose()
    .use([retainState()]);

  const result = await app(500);
  const otherResult = await app(206);

  expect(result)
    .toEqual(500);
  expect(otherResult)
    .toEqual(500);


  const app2 = compose()
    .use(retainState());

  const result2 = await app2(500);
  const otherResult2 = await app2(206);

  expect(result2)
    .toEqual([500]);
  expect(otherResult2)
    .toEqual([500]);

  const app3 = compose()
    .use([[retainState()]]);

  const result3 = await app3([500]);
  const otherResult3 = await app3([206]);

  expect(result3)
    .toEqual(500);
  expect(otherResult3)
    .toEqual(500);

  const app4 = compose()
    .use([retainState(), retainState()]);

  const result4 = await app4([500, 501]);
  const otherResult4 = await(app4([206, 207]));

  expect(result4).toEqual([500, 501]);
  expect(otherResult4).toEqual([500, 501]);

  const app5 = compose()
    .use([retainState()]);

  const result5 = await app5(500, 100);

  expect(result5).toEqual(500);
});

it('should be possible to execute asynchronous applications as if they were sequential', () => {
  expect(() => compose(2)).toThrow();
  expect(() => compose({ sync: 2 })).toThrow();

  const app = compose({ sync: true })
    .use(addTwo());

  const result = app(2);

  expect(result)
    .toEqual([4]);

  const app2 = compose({ sync: true })
    .use([addTwo()]);

  expect(() => app2(2)).toThrow();
});
