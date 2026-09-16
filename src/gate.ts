/**
 * Beta gate: asks for the tester password before loading the game.
 * Only a SHA-256 hash of the password lives here.
 */
const HASH = '25a1f47c1841dce0ec7f232d32accd7d5fba23a07988e0c0763f444bd86a9548';
const STORAGE_KEY = 'relay.beta';

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function unlocked(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === HASH;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(STORAGE_KEY, HASH);
  } catch {
    // Private mode etc. - the gate will just ask again next time.
  }
}

async function startGame(): Promise<void> {
  document.getElementById('gate')?.remove();
  await import('./main');
}

function showGate(): void {
  const gate = document.getElementById('gate') as HTMLElement;
  const form = document.getElementById('gate-form') as HTMLFormElement;
  const input = document.getElementById('gate-input') as HTMLInputElement;
  const error = document.getElementById('gate-error') as HTMLElement;

  gate.hidden = false;
  input.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const hash = await sha256(input.value.trim());
    if (hash === HASH) {
      remember();
      void startGame();
    } else {
      error.textContent = 'Wrong password.';
      input.select();
    }
  });
}

if (unlocked()) {
  void startGame();
} else {
  showGate();
}
