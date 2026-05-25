# TODO App

A basic TODO app built with Next.js 14, Prisma, PostgreSQL, and Docker.

## Description on the Feature - Assisted TODO Creation

The assisted TODO creation feature uses a prediction system to suggest TODO titles as the user types, reducing manual entry effort for marking similar and repeating tasks. 

TODOs creation is assisted by a 3 predictors based on the task sequence, creation time, and term frequency. In daily workflow, this would allow me to note follow-up tasks without breaking concentration on the current one.

The input field for the TODO serves the purpose for searching past TODOs, which are tracked to create a time profile and term-frequency profile.

If I have more time on the feature, I would implement the following 2 changes

- To further improve on the prediction system, I would replace the TF-IDF clustering with a embedding model, which can capture the meaning of each task without relying on the user keyword history.  
- For temporal prediction, the current bucket-based approach is not data-driven, which would only be applicable to a small set of recurring tasks. I would change it to a statistical approach, which handles all interval patterns natively.

## Feature Breakdown

### Sequential Prediction
The app learns which tasks tend to follow others. For example, if you often write a TODO "Review code" after "Write code", 
then when you mark "Write code" as done, the app may suggest "Review code" as a next step.

### Temporal Prediction
The app also learns the time-of-day and day-of-week patterns for your tasks. 
If you usually do "Check email" at 9 AM on weekdays, then around that time it may suggest "Check email".

### TF-IDF Prediction
When you search for a TODO, the app uses TF-IDF to understand the meaning of your query based on similar past tasks. 
For example, if you type "change lightbulb in the living room", it might suggest "buy lightbulb for living room" based on similarity with "lightbulb" and "living room".

## Tech Stack

Next.js 14, React 18, TypeScript, Tailwind CSS, PostgreSQL 16, Prisma 5, Vitest 3, SWR, Docker
