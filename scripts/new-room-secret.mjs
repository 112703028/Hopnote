// Prints a 128-bit room secret: 32 lowercase hex characters.
const bytes = crypto.getRandomValues(new Uint8Array(16));
console.log(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
