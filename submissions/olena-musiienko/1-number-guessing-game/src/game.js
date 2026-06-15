const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

async function main() {
    const rl = readline.createInterface({input, output});

    let playAgain = true;

    const modes = {
        1: {mode: "Easy", chances: 10},
        2: {mode: "Medium", chances: 5},
        3: {mode: "Hard", chances: 3},
    };

    const welcomeMessage = `Welcome to the Number Guessing Game!
    Try to guess the secret number between 1 and 100.
    You can select a difficulty level that determines how many chances you have to guess the number.
    Good luck!`;
    console.log(welcomeMessage);

    while (playAgain) {
        const secret = Math.floor(Math.random() * 100) + 1;

        const timeTracker = (startGameTime, endGameTime) => {
            const timeTaken = ((endGameTime - startGameTime) / 1000).toFixed(2);
            console.log(`Time taken: ${timeTaken} seconds.`);
        }

        let attempts = 0;
        let won = false;

        console.log(`Select a mode: 
    Press 1 for Easy 
    Press 2 for Medium
    Press 3 for Hard `);

        const modeSelection = await rl.question("");
        const selectedMode = modes[modeSelection] ?? modes[2];
        const chances = selectedMode.chances;
        const startGameTime = new Date().getTime();
        let endGameTime;

        if (!modes[modeSelection]) {
            console.log(`Invalid selection, defaulting to ${selectedMode.mode} mode.You have ${chances} chances to guess the number between 1 and 100.`);
        } else {
            console.log(`You have selected mode ${selectedMode.mode}. You have ${chances} chances to guess the number between 1 and 100.`);
        }

        while (attempts < chances && !won) {
            const answer = await rl.question("Enter your guess: ");
            const guess = Number(answer);

            if (Number.isNaN(guess)) {
                console.log(`Invalid input. Please enter a number between 1 and 100. ${chances} chances left.`);
                continue; // skip the rest of the loop and ask again
            }
            if (guess < 1 || guess > 100) {
                console.log(`Out of range. Please enter a number between 1 and 100. ${chances} chances left.`);
                continue; // skip the rest of the loop and ask again
            }
            attempts++;
            const chancesLeft = chances - attempts;

            console.log("You guessed:", answer);

            if (selectedMode.mode !== "Hard") {
                switch (attempts) {
                    case Math.round(chances/2):
                        console.log(`Hint: The number is ${secret % 2 === 0 ? "even" : "odd"}.`);
                        break;
                    case Math.round(chances/3):
                        console.log(`Hint: The number is ${secret > 50 ? "greater than 50" : "less than or equal to 50"}.`);
                        break;
                    case Math.round(chances/4):
                        const range = 10;
                        const lowerBound = Math.max(1, secret - range);
                        const upperBound = Math.min(100, secret + range);
                        console.log(`Hint: The number is between ${lowerBound} and ${upperBound}.`);
                        break;
                    default:
                        break;
                }
            }

            if (guess === secret) {
                console.log(`Congratulations! You guessed it in ${attempts} attempts.`);
                won = true;
                endGameTime = new Date().getTime();
                timeTracker(startGameTime, endGameTime);
                break; // leave the loop
            } else if (guess < secret) {
                console.log(`The number is greater than your guess! ${chancesLeft} chances left.`);

            } else if (guess > secret) {
                console.log(`The number is less than your guess! ${chancesLeft} chances left.`);
            } else {
                console.log(`Something went wrong`);
            }
        }



        if (!won) {
            console.log(`Out of chances! The number was ${secret}.`);
            endGameTime = new Date().getTime();
            timeTracker(startGameTime, endGameTime);
        }

        const newGame = await rl.question("Play again? Press Y/N: ");

        if (newGame.toLowerCase() !== "y") {
            playAgain = false;
        }
    }

    console.log("Thanks for playing!");
    rl.close(); // without this, the program never ends
}

main();