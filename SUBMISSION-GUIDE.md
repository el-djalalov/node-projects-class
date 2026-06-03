# Submission Guide

Follow these steps for **each** project. They're the same every time, so it gets fast after the first one.

## One-time setup

1. Make sure you have a GitHub account and have been added to this repository.
2. Clone the repo to your computer:

   ```bash
   git clone <REPO-URL>
   cd node-projects-class
   ```

3. Create your submissions folder (replace `your-username` with your real GitHub username):

   ```bash
   mkdir -p submissions/your-username
   ```

## For each project

### 1. Make a branch

Always work on your own branch, never on `main`. Name it `submission/<username>/<project>`:

```bash
git checkout main
git pull                                   # get the latest
git checkout -b submission/your-username/1-number-guessing
```

### 2. Write your code in your folder

Put all your files for this project inside your own project folder:

```
submissions/your-username/1-number-guessing/game.js
submissions/your-username/1-number-guessing/README.md
```

Include a short `README.md` in each project folder saying how to run it (e.g. `node game.js`).

### 3. Commit and push

```bash
git add submissions/your-username/1-number-guessing
git commit -m "Project 1: number guessing game"
git push -u origin submission/your-username/1-number-guessing
```

### 4. Open a pull request

- Go to the repo on GitHub. It will offer a **"Compare & pull request"** button — click it.
- Title it clearly: `Project 1 — <your name>`.
- In the description, mention anything you struggled with or want feedback on.
- Click **Create pull request**.

### 5. Respond to feedback

Your instructor will review your PR and leave comments. If they **request changes**:

```bash
# make your edits, then:
git add submissions/your-username/1-number-guessing
git commit -m "Address review feedback"
git push          # the PR updates automatically
```

When it's approved, the instructor merges it. You're done with that project.

## Common mistakes to avoid

- **Working on `main`.** Always branch first (step 1).
- **Editing someone else's folder or the `projects/` briefs.** Your PR should only touch files inside `submissions/your-username/`.
- **Committing `node_modules/` or data files.** These are ignored already — don't force-add them.
- **One giant PR for everything.** One PR per project keeps feedback focused.

## Quick reference

```bash
git status                  # what have I changed?
git checkout main && git pull   # get the latest before a new project
git checkout -b submission/your-username/<project>   # start a project
git add <your folder> && git commit -m "..."         # save your work
git push -u origin <branch-name>                     # send it to GitHub
```
