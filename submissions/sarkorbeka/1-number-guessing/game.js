const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')

const difficultyLevels = {
  Easy: 10,
  Medium: 5,
  Hard: 3,
}

async function main() {
  const rl = readline.createInterface({ input, output })

  console.log("Welcome to the Number Guessing Game!")
  console.log("I'm thinking of a number between 1 and 100.")
  console.log("Pick a difficulty level and see if you can guess it!")

  const secret = Math.floor(Math.random() * 100) + 1
  let chances = 0

  while (true) {
    const difficulty = await rl.question('Select difficulty (Easy/Medium/Hard): ')
    const key = (difficulty || '').trim().toLowerCase()
    const map = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    }

    const selected = map[key]
    if (selected && difficultyLevels[selected]) {
      chances = difficultyLevels[selected]
      console.log(`You selected ${selected}. You have ${chances} attempts.`)

      break
    } else {
      console.log('Please enter a valid difficulty (Easy/Medium/Hard).')

      continue
    }
  }

  let attempts = 0
  let won = false

  while (attempts < chances) {
    const remaining = chances - attempts
    const answer = await rl.question(`Enter your guess (${remaining} left): `)

    const guess = Number(answer)

    if (Number.isNaN(guess)) {
      console.log('Please enter a valid number.')
      continue
    }

    if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
      console.log('Please enter an integer between 1 and 100.')

      continue
    }

    attempts++

    if (guess === secret) {
      console.log(`Congratulations! You guessed it in ${attempts} attempts.`)
      won = true
      break
    }

    if (guess < secret) {
      console.log('The number is greater than your guess.')
    } else {
      console.log('The number is less than your guess.')
    }
  }

  if (!won) {
    console.log(`Out of chances! The number was ${secret}.`)
  }

  rl.close()
}

main()

