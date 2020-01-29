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

//const somethingThatHandlesAll = () => handle => {
//  handle('*', () => {
//    console.log('something that handles all');
//    return 42;
//  });
//};
//
//const somethingThatHandlesAllMulti = () => handle => {
//  handle('handlesAllMulti', () => console.log('something that handles all'));
//  handle('handlesAllMultiRound2', () => console.log('something that handles all'));
//};
//
//const somethingThatHandlesTheFirstElement = () => handle => {
//  handle('handlesTheFirstElement', () => console.log('something that handles all'));
//  handle('handlesTheFirstElementRound2', () => console.log('something that handles all'));
//};
//
//const somethingThatHandlesTheSecondElement = () => handle => {
//  handle('handlesTheSecond', () => console.log('something that handles all'));
//  handle('handlesTheSecondRound2', () => console.log('something that handles all'));
//};
//
//const somethingThatHandlesTheFirstIndex = () => handle => {
//  handle('handlesTheFirstIndex', () => console.log('something that handles all'));
//};
//
//const somethingThatHandlesTheSecondIndex = () => handle => {
//  handle('handlesTheSecondIndex', () => console.log('something that handles all'));
//};
//
//const somethingThatHandlesTheSecondIndexFirstIndex = () => handle => {
//  handle('handlesTheSecondIndexFirstIndex', () => console.log('something that handles all'));
//  handle('handlesTheSecondIndexFirstIndexRound2', () => console.log('something that handles all'));
//};

it('should export an argument filtering interface', async () => {

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
  //const result2 = await app([2], [2]);
  console.log(JSON.stringify(result));
  //await app(4);

  expect(true).toBeTruthy();
});
