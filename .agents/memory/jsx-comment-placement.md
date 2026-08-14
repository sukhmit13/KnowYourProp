---
name: JSX comment placement
description: Where JSX comments break the client build.
---
A `{/* comment */}` placed directly inside an arrow function's parenthesized return within `.map((x) => ( {/* here */} <div…` breaks the Babel/Vite build with a cryptic parse error. Put the comment above the `.map()` call or inside the returned element instead.
**Why:** cost a broken preview once; the error line number points far from the actual comment.
