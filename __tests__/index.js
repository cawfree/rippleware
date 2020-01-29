import '@babel/polyfill';

import compose from '../src';

const addTwo = () => handle => handle(
  '[Number]', (next, last) => {
    console.log('next state is',next, 'last state was ',last);
    return next.map(e => (e + 2));
  },
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
    // each handler deserves dedicated state, if it hasn't been executed, it cant get, it is entirely different data, too difficult, just share state
    //.use(somethingThatHandlesAll())
    //.use(somethingThatHandlesAllMulti())
    //.use(
    //  // XXX: as a whole, without indexing
    //  somethingThatHandlesTheFirstElement(), //give me the first element
    //  somethingThatHandlesTheSecondElement(), // give me the second element
    //)
    .use(
      addTwo(),
      addTwo(),
      //somethingThatHandlesAll(),
      // XXX: this is first index of first element
      //[somethingThatHandlesAll(), somethingThatHandlesAll()],
      //[somethingThatHandlesAll()],
    )
    .use(
      addTwo(),
      addTwo(),
    );
    //.use(
    //  [somethingThatHandlesTheFirstIndex(), somethingThatHandlesTheSecondIndex()],
    //  [somethingThatHandlesTheFirstIndex(), [somethingThatHandlesTheSecondIndexFirstIndex()]],
    //);

  const result = await app([2], [2]);
  const result2 = await app([2], [2]);
  console.log(result);
  //await app(4);

  expect(true).toBeTruthy();
});
