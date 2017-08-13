import { CacheContext } from '../../../src/context';
import { GraphSnapshot } from '../../../src/GraphSnapshot';
import { read, write } from '../../../src/operations';
import { Query, StaticNodeId } from '../../../src/schema';
import { query } from '../../helpers';

const { QueryRoot: QueryRootId } = StaticNodeId;

describe(`operations.read`, () => {

  const context = new CacheContext();

  const empty = new GraphSnapshot();

  const viewerQuery = query(`{
    viewer {
      id
      name
    }
  }`);

  const parameterizedQuery = query(`query getAFoo($id: ID!) {
    user(id: $id, withExtra: true) {
      id name extra
    }
    stuff
  }`, { id: 1 });

  describe(`with an empty cache`, () => {

    it(`returns undefined when fetching anything.`, () => {
      expect(read(context, viewerQuery, empty).result).to.eq(undefined);
    });

    it(`is marked incomplete`, () => {
      expect(read(context, viewerQuery, empty).complete).to.eq(false);
    });

    it(`includes no node ids if requested`, () => {
      expect(Array.from(read(context, viewerQuery, empty, true).nodeIds)).to.have.members([]);
    });

  });

  describe(`with a complete cache`, () => {

    let snapshot: GraphSnapshot;
    beforeAll(() => {
      snapshot = write(context, empty, viewerQuery, {
        viewer: {
          id: 123,
          name: 'Foo Bar',
        },
      }).snapshot;
    });

    it(`returns the selected values.`, () => {
      const { result } = read(context, viewerQuery, snapshot);
      expect(result).to.deep.eq({
        viewer: {
          id: 123,
          name: 'Foo Bar',
        },
      });
    });

    it(`is marked complete`, () => {
      const { complete } = read(context, viewerQuery, snapshot);
      expect(complete).to.eq(true);
    });

    it(`includes all related node ids, if requested`, () => {
      const { nodeIds } = read(context, viewerQuery, snapshot, true);
      expect(Array.from(nodeIds)).to.have.members([QueryRootId, '123']);
    });

  });

  describe(`with a partial cache`, () => {

    let snapshot: GraphSnapshot;
    beforeAll(() => {
      snapshot = write(context, empty, viewerQuery, {
        viewer: {
          id: 123,
        },
      }).snapshot;
    });

    it(`returns the selected values.`, () => {
      const { result } = read(context, viewerQuery, snapshot);
      expect(result).to.deep.eq({
        viewer: {
          id: 123,
        },
      });
    });

    it(`is marked incomplete`, () => {
      const { complete } = read(context, viewerQuery, snapshot);
      expect(complete).to.eq(false);
    });

    it(`includes all related node ids, if requested`, () => {
      const { nodeIds } = read(context, viewerQuery, snapshot, true);
      expect(Array.from(nodeIds)).to.have.members([QueryRootId, '123']);
    });

  });

  describe(`with a null subgraphs`, () => {

    let nestedQuery: Query, snapshot: GraphSnapshot;
    beforeAll(() => {
      nestedQuery = query(`{
        one {
          two {
            three { four }
          }
          five
        }
      }`);
      snapshot = write(context, empty, nestedQuery, {
        one: {
          two: null,
          five: 'hi',
        },
      }).snapshot;
    });

    it(`returns the selected values.`, () => {
      const { result } = read(context, nestedQuery, snapshot);
      expect(result).to.deep.eq({
        one: {
          two: null,
          five: 'hi',
        },
      });
    });

    it(`is marked complete`, () => {
      const { complete } = read(context, nestedQuery, snapshot);
      expect(complete).to.eq(true);
    });

    it(`includes all related node ids, if requested`, () => {
      const { nodeIds } = read(context, nestedQuery, snapshot, true);
      expect(Array.from(nodeIds)).to.have.members([QueryRootId]);
    });

  });

  describe(`with arrays of complete values`, () => {

    let snapshot: GraphSnapshot;
    beforeAll(() => {
      snapshot = write(context, empty, viewerQuery, {
        viewer: [
          { id: 1, name: 'Foo' },
          { id: 2, name: 'Bar' },
          { id: 3, name: 'Baz' },
        ],
      }).snapshot;
    });

    it(`returns the selected values.`, () => {
      const { result } = read(context, viewerQuery, snapshot);
      expect(result).to.deep.eq({
        viewer: [
          { id: 1, name: 'Foo' },
          { id: 2, name: 'Bar' },
          { id: 3, name: 'Baz' },
        ],
      });
    });

    it(`is marked complete`, () => {
      const { complete } = read(context, viewerQuery, snapshot);
      expect(complete).to.eq(true);
    });

    it(`includes all related node ids, if requested`, () => {
      const { nodeIds } = read(context, viewerQuery, snapshot, true);
      expect(Array.from(nodeIds)).to.have.members([QueryRootId, '1', '2', '3']);
    });

  });

  describe(`parameterized edges`, () => {

    describe(`with a complete cache`, () => {

      let snapshot: GraphSnapshot;
      beforeAll(() => {
        snapshot = write(context, empty, parameterizedQuery, {
          user: { id: 1, name: 'Foo', extra: true },
          stuff: 123,
        }).snapshot;
      });

      it(`returns the selected values, overlaid on the underlying data`, () => {
        const { result } = read(context, parameterizedQuery, snapshot);
        expect(result).to.deep.equal({
          user: { id: 1, name: 'Foo', extra: true },
          stuff: 123,
        });
      });

    });

    describe(`with nested edges`, () => {

      const nestedQuery = query(`query nested($id: ID!) {
        one {
          two(id: $id) {
            id
            three {
              four(extra: true) {
                five
              }
            }
          }
        }
      }`, { id: 1 });

      describe(`and a full store`, () => {

        let snapshot: GraphSnapshot;
        beforeAll(() => {
          snapshot = write(context, empty, nestedQuery, {
            one: {
              two: [
                {
                  id: 1,
                  three: {
                    four: { five: 1 },
                  },
                },
                {
                  id: 2,
                  three: {
                    four: { five: 2 },
                  },
                },
              ],
            },
          }).snapshot;
        });

        it(`returns the selected values, overlaid on the underlying data`, () => {
          const { result } = read(context, nestedQuery, snapshot);
          expect(result).to.deep.equal({
            one: {
              two: [
                {
                  id: 1,
                  three: {
                    four: { five: 1 },
                  },
                },
                {
                  id: 2,
                  three: {
                    four: { five: 2 },
                  },
                },
              ],
            },
          });
        });

      });

      describe(`and an empty store`, () => {

        it(`doesn't recurse to nested edges if there are no values for their parent`, () => {
          const { result } = read(context, nestedQuery, empty);
          expect(result).to.deep.equal(undefined);
        });

        it(`is marked incomplete`, () => {
          const { complete } = read(context, nestedQuery, empty);
          expect(complete).to.eq(false);
        });

      });

      describe(`and an empty value`, () => {

        let snapshot: GraphSnapshot;
        beforeAll(() => {
          snapshot = write(context, empty, nestedQuery, {
            one: {
              two: [
                {
                  id: 1,
                  three: {
                    four: [],
                  },
                },
              ],
            },
          }).snapshot;
        });

        it(`returns the selected values, overlaid on the underlying data`, () => {
          const { result } = read(context, nestedQuery, snapshot);
          expect(result).to.deep.equal({
            one: {
              two: [
                {
                  id: 1,
                  three: {
                    four: [],
                  },
                },
              ],
            },
          });
        });

      });

      describe(`and a null container`, () => {

        let snapshot: GraphSnapshot;
        beforeAll(() => {
          snapshot = write(context, empty, nestedQuery, { one: null }).snapshot;
        });

        it(`returns the selected values, overlaid on the underlying data`, () => {
          const { result } = read(context, nestedQuery, snapshot);
          expect(result).to.deep.equal({ one: null });
        });

        it(`is marked complete`, () => {
          const { complete } = read(context, nestedQuery, snapshot);
          expect(complete).to.eq(true);
        });

      });

      describe(`and a null root snapshot`, () => {

        let snapshot: GraphSnapshot;
        beforeAll(() => {
          snapshot = write(context, empty, nestedQuery, {
            one: {
              two: null,
            },
          }).snapshot;
        });

        it(`returns the selected values, overlaid on the underlying data`, () => {
          const { result } = read(context, nestedQuery, snapshot);
          expect(result).to.deep.equal({
            one: {
              two: null,
            },
          });
        });

        it(`is marked complete`, () => {
          const { complete } = read(context, nestedQuery, snapshot);
          expect(complete).to.eq(true);
        });

      });

      describe(`and a null intermediate node`, () => {

        let snapshot: GraphSnapshot;
        beforeAll(() => {
          snapshot = write(context, empty, nestedQuery, {
            one: {
              two: {
                id: 1,
                three: null,
              },
            },
          }).snapshot;
        });

        it(`returns the selected values, overlaid on the underlying data`, () => {
          const { result } = read(context, nestedQuery, snapshot);
          expect(result).to.deep.equal({
            one: {
              two: {
                id: 1,
                three: null,
              },
            },
          });
        });

        it(`is marked complete`, () => {
          const { complete } = read(context, nestedQuery, snapshot);
          expect(complete).to.eq(true);
        });

      });

    });

    describe(`with a value of []`, () => {

      let snapshot: GraphSnapshot;
      beforeAll(() => {
        snapshot = write(context, empty, parameterizedQuery, {
          user: [],
          stuff: 123,
        }).snapshot;
      });

      it(`returns the selected values, overlaid on the underlying data`, () => {
        const { result } = read(context, parameterizedQuery, snapshot);
        expect(result).to.deep.equal({
          user: [],
          stuff: 123,
        });
      });

    });

  });

  describe(`cyclic references`, () => {

    describe(`in a complete cache`, () => {

      let cyclicQuery: Query, snapshot: GraphSnapshot;
      beforeAll(() => {
        cyclicQuery = query(`{
          foo {
            id
            name
            bar {
              id
              name
              fizz { id }
              buzz { id }
            }
          }
        }`);

        snapshot = write(context, empty, cyclicQuery, {
          foo: {
            id: 1,
            name: 'Foo',
            bar: {
              id: 2,
              name: 'Bar',
              fizz: { id: 1 },
              buzz: { id: 2 },
            },
          },
        }).snapshot;
      });

      it(`can be read`, () => {
        const { result } = read(context, cyclicQuery, snapshot);
        const foo = result.foo;
        const bar = foo.bar;

        expect(foo.id).to.eq(1);
        expect(foo.name).to.eq('Foo');
        expect(foo.bar).to.eq(bar);

        expect(bar.id).to.eq(2);
        expect(bar.name).to.eq('Bar');
        expect(bar.fizz).to.eq(foo);
        expect(bar.buzz).to.eq(bar);
      });

      it(`is marked complete`, () => {
        const { complete } = read(context, cyclicQuery, snapshot);
        expect(complete).to.eq(true);
      });

      it(`includes all related node ids, if requested`, () => {
        const { nodeIds } = read(context, cyclicQuery, snapshot, true);
        expect(Array.from(nodeIds)).to.have.members([QueryRootId, '1', '2']);
      });

    });

    describe(`in a partial cache`, () => {

      let cyclicQuery: Query, snapshot: GraphSnapshot;
      beforeAll(() => {
        cyclicQuery = query(`{
          foo {
            id
            name
            bar {
              id
              name
              fizz { id }
              buzz { id }
            }
          }
        }`);

        snapshot = write(context, empty, cyclicQuery, {
          foo: {
            id: 1,
            name: 'Foo',
            bar: {
              id: 2,
              fizz: { id: 1 },
              buzz: { id: 2 },
            },
          },
        }).snapshot;
      });

      it(`can be read`, () => {
        const { result } = read(context, cyclicQuery, snapshot);
        const foo = result.foo;
        const bar = foo.bar;

        expect(foo.id).to.eq(1);
        expect(foo.name).to.eq('Foo');
        expect(foo.bar).to.eq(bar);

        expect(bar.id).to.eq(2);
        expect(bar.fizz).to.eq(foo);
        expect(bar.buzz).to.eq(bar);
      });

      it(`is marked complete`, () => {
        const { complete } = read(context, cyclicQuery, snapshot);
        expect(complete).to.eq(false);
      });

      it(`includes all related node ids, if requested`, () => {
        const { nodeIds } = read(context, cyclicQuery, snapshot, true);
        expect(Array.from(nodeIds)).to.have.members([QueryRootId, '1', '2']);
      });

    });
  });

});