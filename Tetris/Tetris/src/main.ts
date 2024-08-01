import "./style.css";
import { fromEvent, interval, merge, Observable, from } from "rxjs";
import { map, filter, scan, startWith } from "rxjs/operators";

/** Constants */

const Viewport = {
  CANVAS_WIDTH: 200,
  CANVAS_HEIGHT: 400,
  PREVIEW_WIDTH: 160,
  PREVIEW_HEIGHT: 80,
} as const;

const Constants = {
  TICK_RATE_MS: 500,
  GRID_WIDTH: 10,
  GRID_HEIGHT: 20,
} as const;

let seed = Math.random();

const Block = {
  WIDTH: Viewport.CANVAS_WIDTH / Constants.GRID_WIDTH,
  HEIGHT: Viewport.CANVAS_HEIGHT / Constants.GRID_HEIGHT,
};

/** User input */

type Key = "KeyS" | "KeyA" | "KeyD" | "KeyW" ;

type Event = "keydown" | "keypress" ;

/** State processing */

// Define the Tetromino interface, representing the properties of a tetromino block.
interface Tetromino{
  shape: number[][], // 2D array representing the shape of the block
  color: number,
  x: number,
  y: number,
}

// Define an array of Tetromino objects, representing different types of tetrominoes.
const tetrominoes: Tetromino[] = [
  { shape: [[1, 1], [1, 1]], color: 1, x: 4, y: -1 }, // The 'O' tetromino
  { shape: [[1, 1, 1, 1]], color: 2, x: 4, y: -1 }, // The 'I' tetromino
  { shape: [[0, 1, 0], [1, 1, 1]], color: 3, x: 4, y: -1 }, // The 'T' tetromino
  { shape: [[1, 1, 1], [1, 0, 0]], color: 4, x: 4, y: -1 }, // The 'L' tetromino
  { shape: [[1, 1, 1], [0, 0, 1]], color: 5, x: 4, y: -1 }, // The 'J' tetromino
  { shape: [[1, 1, 0], [0, 1, 1]], color: 6, x: 4, y: -1 }, // The 'S' tetromino
  { shape: [[0, 1, 1], [1, 1, 0]], color: 7, x: 4, y: -1 }, // The 'Z' tetromino
];

const tetrominoColours: Record<number, string> = {
  1: "yellow",
  2: "cyan",
  3: "purple",
  4: "orange",
  5: "blue",
  6: "red",
  7: "green",
};

// Define a function for getting the colour of a tetromino block.
const blockColours = (id: number): string => tetrominoColours[id] || "black";

// Define the type 'State', representing the state of the game.
type State = Readonly<{
  gameEnd: boolean;
  grid: number[][],
  fallingBlock: Tetromino,
  nextBlock: Tetromino,
  score: number,
  level: number,
}>;

// Creating the initial state of the game.
const initialState: State = {
  gameEnd: false,
   // Create an empty game grid with dimensions defined in Constants.
  grid: Array.from({ length: Constants.GRID_HEIGHT }, () =>
    Array.from({ length: Constants.GRID_WIDTH }, () => 0)
  ),
  fallingBlock: tetrominoes[Math.floor(Math.random() * tetrominoes.length)],
  nextBlock: tetrominoes[Math.floor(Math.random() * tetrominoes.length)],
  score: 0,
  level: 1,
} as const;

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {}
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
};

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main() {
  // Canvas elements
  const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
    HTMLElement;
  const preview = document.querySelector("#svgPreview") as SVGGraphicsElement &
    HTMLElement;
  const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
    HTMLElement;
  const container = document.querySelector("#main") as HTMLElement;

  svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
  svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);
  preview.setAttribute("height", `${Viewport.PREVIEW_HEIGHT}`);
  preview.setAttribute("width", `${Viewport.PREVIEW_WIDTH}`);

  // Text fields
  const levelText = document.querySelector("#levelText") as HTMLElement;
  const scoreText = document.querySelector("#scoreText") as HTMLElement;


  /** User input derived from provided asteroid game and weekly tutorial classes */
  // Define a class for representing a tick event.
  class Tick { constructor(public readonly elapsed:number) {} }
  // Define a class for representing a move event with x and y coordinates.
  class Move { constructor(public readonly x:number, public readonly y:number) {} }
  // Define a class for representing a rotated event.
  class Rotate { constructor() {}}

  /**
   * This is the observable stream of user input events.
   */
  const 
    tick$ = interval(Constants.TICK_RATE_MS)
    .pipe(map(elapsed => new Tick(elapsed))),

    keyObservable = <T>(e: Event, k: Key, result: ()=> T) => 
      fromEvent<KeyboardEvent>(document, e)
      .pipe(
        filter(({ code }) => code === k), // filter events by key code
        filter(({ repeat }) => !repeat), // filter out repeated key presses
        map(result)),

    left$ = keyObservable("keypress", "KeyA", () => new Move( -1, 0 )),
    right$ = keyObservable("keypress", "KeyD", () => new Move( 1, 0 )),
    down$ = keyObservable("keypress", "KeyS", () => new Move( 0, 1 )),
    rotate$ = keyObservable("keydown", "KeyW", () => new Rotate());


  // Create 'gameState$' observable by merging various input observables and updating the game state.
  const gameState$: Observable<State> = merge(left$,right$,down$,rotate$,
    tick$.pipe(map(() => new Move(0,1)))
  ).pipe(
    scan((state, movement) => stateUpdater(state, movement), initialState),
  );

  /** Game states changes */
  /**
 * Rotates the current tetromino clockwise by 90 degrees.
 * @param shape - The input 2D shape (tetromino) to rotate.
 * @returns A new 2D shape (tetromino) representing the rotated shape.
 */
  function tetrominoRotation(shape: number[][]): number[][] {
    // Use the transpose and reverse operations to rotate the shape.
    const rotatedBlock = shape[0].map((_, columnIndex) =>
      shape.map((row) => row[columnIndex]).reverse()
    );
  
    return rotatedBlock;
  }

  /**
 * Merges the current falling block with the blocks that have landed on the game grid.
 * I acknowledge the use of ChatGPT (chat.openai.com) to generate ideas for keeping tetrominoes colours.
 * The prompts used include 'how can I keep my tetrominoes colours in a game board made up of grids?'. 
 * The output from these prompts was used to create the function 'mergeBlockWithBlock'.
 * @param grid - The current game grid.
 * @param block - The tetromino block to be merged.
 * @returns A new game grid with the block merged in place.
 */
  function mergeBlockWithBlock(grid: number[][], block: Tetromino): number[][] {
    // Create a copy of the current game grid to avoid modifying the original.
    const gridResult = grid.map(row => [...row]);

    // Use 'reduce' to iterate through the block's shape and merge it with the grid.
    return block.shape.reduce((outerAcc, row, y) => {
      return row.reduce((innerAcc, cell, x) => {
        if (cell !== 0) {
          const gridX = block.x + x;
          const gridY = block.y + y;

          // Check if the block's position is within the grid boundaries.
          if (gridY >= 0 && gridY <= Constants.GRID_HEIGHT && gridX >= 0 && gridX < Constants.GRID_WIDTH) {
            // Check if the grid cell is empty or occupied by the same block.
            if (innerAcc[gridY][gridX] <= 0) {
              innerAcc[gridY][gridX] = block.color; // Merge the block's color into the grid.
            }
          }
        }
        return innerAcc;
      }, outerAcc);
    }, gridResult);
  }

    /**
   * Checks for collision between a tetromino block and the game grid with optional offset.
   * Idea taken from provided asteroid game.
   * @param grid - The current game grid.
   * @param block - The tetromino block to check for collision.
   * @param offsetX - Optional horizontal offset for checking collision.
   * @param offsetY - Optional vertical offset for checking collision.
   * @returns True if collision is detected, otherwise false.
   */
  function collisionChecker(grid: number[][], block: Tetromino, offsetX: number, offsetY: number): boolean {
    // Use 'some' to iterate through the shape of the block.
    return block.shape.some((shapeRow, shapeY) => {
      return shapeRow.some((shapeCell, shapeX) => {
        if (shapeCell !== 0) {
          const blockX = block.x + shapeX;
          const blockY = block.y + shapeY;
          const targetX = blockX + offsetX;
          const targetY = blockY + offsetY;

          // Check for collision with left, right and bottom walls, and other blocks.:
          return (
            targetX < 0 ||                                            
            targetX >= Constants.GRID_WIDTH ||                       
            targetY >= Constants.GRID_HEIGHT ||                      
            (grid[targetY] && grid[targetY][targetX] !== 0 && shapeCell !== 0) 
          );
        }
        return false;
      });
    });
  }

  // Idea taken from week 4 tutorial class
  function rngStream() {
    const a = 1664525;
    const c = 1013904223;
    const m = 4294967296; // 2^32
    seed = (a * seed + c) % m;
    return seed / m;
  }

  // Generate a random tetromino from the available shapes
  function getRandomTetromino(): Tetromino {
    const validIndexRange = 7; // Number of available tetrominoes
    const randomIndex = (rngStream() * validIndexRange) | 0; // Generate a random index (0-6);
    const randomTetromino = { ...tetrominoes[randomIndex], x: 4, y: 0 };
    return randomTetromino;
  }
  

  /**
 * Checks if a tetromino block should be locked in place.
 * @param block - The tetromino block to check.
 * @param grid - The current game grid.
 * @returns True if the block should be locked, otherwise false.
 */
function lockBlockChecker(block: Tetromino, grid: number[][]): boolean {
  // Check collision with the bottom of the game grid
  if (block.y + block.shape.length > Constants.GRID_HEIGHT - 1) {
    // Block is at or below the bottom, so it should be locked
    return true;
  }

  // Check collision with landed blocks (using the collisionChecker function)
  if (collisionChecker(grid, block, 0, 1)) {
    // Block would collide with another block below it, so it should be locked
    return true;
  }

  // Check if the block is above the visible game grid (game over condition)
  if (block.y < -1) {
    // Block has moved above the top of the visible grid, indicating game over
    return true;
  }

  // If none of the above conditions are met, the block should not be locked
  return false;
}

    /**
   * Locks the current falling block in place on the game grid.
   * @param state - The current game state.
   * @param block - The tetromino block to lock in place.
   * @returns The updated game state after locking the block.
   */
  function lockBlock(state: State, block: Tetromino): State {
    // Merge the current grid with the block (similar to 'mergeBlockWithBlock' but without collision checks).
    const newGrid = mergeBlockWithBlock(state.grid, block);

    // Generate a new random tetromino for the next falling block.
    const nextBlock = getRandomTetromino();

    const topRowFull = newGrid[0].some((cell) => cell !== 0);

    if (topRowFull) {
      // The top row is full, indicating game over
      return {
        ...state,
        gameEnd: true,
      };
    }

    // Create a new grid with the block locked in place.
    const lockedGrid = block.shape.reduce((gridAcc, row, y) => {
      return row.reduce((rowAcc, cell, x) => {
        if (cell !== 0) {
          const occupiedGridX = block.x + x;
          const occupiedGridY = block.y + y;
          rowAcc[occupiedGridY][occupiedGridX] = block.color;
        }
        return rowAcc;
      }, gridAcc);
    }, [...newGrid]);

    // Return the updated game state with the locked block and the next block.
    return {
      ...state,
      grid: lockedGrid,
      fallingBlock: nextBlock,
      nextBlock,
    };
  }
  
    /**
   * Clears completed rows, awards points, and adjusts the game level.
   * @param grid - The current game grid.
   * @param score - The current player's score.
   * @param level - The current game level.
   * @returns An array containing the updated game grid, score, and level.
   */
  function clearAndMoveRows(grid: number[][], score: number, level: number): [number[][], number, number] {
    // Filter rows with at least one cell equal to 0 (uncleared rows).
    const clearedRows = grid.filter(row => row.some(cell => cell === 0));
    // Calculate the number of cleared rows.
    const clearedRowCount = grid.length - clearedRows.length;

    // Create new rows to replace the cleared rows (filled with 0s).
    const newRows = Array.from({ length: clearedRowCount }, () =>
      Array(Constants.GRID_WIDTH).fill(0)
    );

    // Calculate the new score by awarding points for cleared rows.
    const Score = score + clearedRowCount * 100;

    // Calculate the new game level based on the updated score.
    const newLevel = (Score/500 |0) + 1;


    // Return an array containing the updated grid, score, and level.
    return [([...newRows, ...clearedRows]), Score, newLevel];
  }

    /**
   * Updates the game state based on player input (movement or rotation).
   * @param state - The current game state.
   * @param movement - The movement or rotation action to apply.
   * @returns The updated game state after applying the action.
   */
    function stateUpdater(state: State, movement: { x: number; y: number } | Rotate): State {
      // Create a copy of the current falling block to make modifications.
      const newFallingBlock = { ...state.fallingBlock };
  
      // Check the type of movement (either Move or Rotate).
      if (movement instanceof Move) {
        // Handle movement action (left, right, or down).
        newFallingBlock.x += movement.x;
        newFallingBlock.y += movement.y;
      } else if (movement instanceof Rotate) {
        // Handle rotation action
        const rotatedBlock = tetrominoRotation(newFallingBlock.shape);
        const rotatedTetromino = { ...newFallingBlock, shape: rotatedBlock };

        // Check if rotation results in a collision before applying it.
        if (!collisionChecker(state.grid, rotatedTetromino, 0, 0)) {
          newFallingBlock.shape = rotatedBlock; // Apply rotation if no collision.
        }
      }
  
      // Check collision with the left and right walls.
      if (newFallingBlock.x < 0) {
        newFallingBlock.x = 0;
      }
      
      if (newFallingBlock.x + newFallingBlock.shape[0].length > Constants.GRID_WIDTH) {
        newFallingBlock.x = Constants.GRID_WIDTH - newFallingBlock.shape[0].length;
      }
  
      // Handle collision with the bottom or other blocks by locking the block.
      if (lockBlockChecker(newFallingBlock, state.grid)) {
        return lockBlock(state, newFallingBlock);
      }

      if (newFallingBlock.y < -1) {
        return {
          ...state,
          gameEnd: true, // End the game when the block reaches the top
        };
      }
  
      // Clear and move rows if necessary, and update the game state accordingly.
      const [newGrid, newScore, newLevel] = clearAndMoveRows(state.grid, state.score, state.level);
  
      return {
        ...state,
        grid: newGrid,
        fallingBlock: newFallingBlock,
        score: newScore,
        level: newLevel,
      };
    }

    /**
   * Clears the SVG canvas by removing all child elements (blocks) from it.
   * @param svg - The SVG element representing the game canvas.
   * @param s - The current game state.
   */
    const clearCanvas = (svg: SVGGraphicsElement, s: State) => {
      // Clear the SVG container when gameEnd is false
      if (!s.gameEnd) {
        Array.from(svg.children).forEach((child) => {
          if (child instanceof SVGRectElement) {
            svg.removeChild(child);
          }
        });
      } 
    };

    /**
   * Renders a tetromino block on the SVG canvas.
   * @param svg - The SVG element representing the game canvas.
   * @param block - The tetromino block to render.
   * @param s - The current game state.
   */
  const renderBlock = (svg: SVGGraphicsElement, block: Tetromino, s: State) => {
    // Check if the game has not ended (prevents rendering during game over).
    if (!s.gameEnd) {
      // Iterate through the rows and cells of the tetromino shape.
      block.shape.forEach((row, y) => {
        row.forEach((cell, x) => {
          // Check if the cell contains a part of the tetromino.
          if (cell !== 0) {
            // Create an SVG rectangle (cube) for the tetromino part.
            const cube = createSvgElement(svg.namespaceURI, "rect", {
              height: `${Block.HEIGHT}`,
              width: `${Block.WIDTH}`,
              x: `${Block.WIDTH * (block.x + x)}`, // Calculate the X position.
              y: `${Block.HEIGHT * (block.y + y)}`, // Calculate the Y position.
              style: `fill: ${blockColours(block.color)}`, // Set the color.
            });

            // Append the cube to the SVG canvas for rendering.
            svg.appendChild(cube);
          }
        });
      });
    }
  };

  /**
   * Renders the game grid on the SVG canvas.
   * @param svg - The SVG element representing the game canvas.
   * @param grid - The game grid to render.
   * @param s - The current game state.
   */
  const renderGrid = (svg: SVGGraphicsElement, grid: number[][], s: State) => {
    // Check if the game has not ended (prevents rendering during game over).
    if (!s.gameEnd) {
      // Iterate through the rows and columns of the game grid.
      grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          // Check if the cell is occupied by a block (cell value is not 0).
          if (cell !== 0) {
            // Create an SVG rectangle (cube) for the occupied grid cell.
            const cube = createSvgElement(svg.namespaceURI, "rect", {
              height: `${Block.HEIGHT}`,
              width: `${Block.WIDTH}`,
              x: `${Block.WIDTH * x}`, // Calculate the X position.
              y: `${Block.HEIGHT * y}`, // Calculate the Y position.
              style: `fill: ${blockColours(cell)}`, // Set the color based on cell value.
            });

            // Append the cube to the SVG canvas for rendering.
            svg.appendChild(cube);
          }
        });
      });
    }
  };

  const render = (s: State) => {
    clearCanvas(svg, s);
    renderGrid(svg, s.grid, s);
    renderBlock(svg, s.fallingBlock, s);
    levelText.textContent = `${s.level}`;
    scoreText.textContent = `${s.score}`;
  };

  gameState$.subscribe((state) => {
    render(state);
    if (state.gameEnd) {
      show(gameover);
    } else {
      hide(gameover);
    }
  });
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}