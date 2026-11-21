// The NPC brain (ChatGPT's template, docs/npc-brain/, fitted to this game): one brain per character, its needs, its
// fight in AUTO, and the port that carries its orders out with that character's own kit (main.ts).
export * from './types';
export * from './brain';
export * from './routines';
export * from './gdmPort';
export * from './autoCombat';
