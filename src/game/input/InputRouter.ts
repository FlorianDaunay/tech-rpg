import { touchInput } from "@/bridge/touch";
import { clampLength, normalize, type Vec2 } from "@/core/math/vec";
import { ACTIONS, type Action, type Intent } from "@/core/sim/intent";
import { useInputDevice, type InputDevice } from "@/store/input";
import { useSettings, type Binding, type MoveDir } from "@/store/settings";

const STICK_DEADZONE = 0.2;

/** Standard-mapping gamepad buttons per action. */
const PAD: Partial<Record<Action, number[]>> = {
  attack: [2], // X / Square
  heavy: [3], // Y / Triangle
  dodge: [0], // A / Cross
  interact: [1], // B / Circle
  skill1: [4], // LB
  skill2: [5], // RB
  block: [6], // LT
  ultimate: [7], // RT
  map: [8], // Back / Share
  pause: [9], // Start / Options
  inventory: [12], // D-pad up
  talents: [13], // D-pad down
};

/**
 * Turns every input device into one `Intent` per simulation step. Gameplay reads Intents only.
 * Presses are latched until consumed so a tap shorter than a frame is never lost.
 */
export class InputRouter {
  private down = new Set<Binding>();
  private latched = new Set<Action>();
  private padPrev = new Set<Action>();
  private mouse = { x: 0, y: 0, moved: false };
  private aimOrigin = { x: 0, y: 0 };
  private disposers: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.listen(window, "keydown", (e) => {
      if (e.repeat) return;
      if (this.isBound(e.code)) e.preventDefault();
      this.press(e.code);
      this.setDevice("keyboard");
    });
    this.listen(window, "keyup", (e) => this.down.delete(e.code));
    this.listen(window, "blur", () => this.down.clear());
    this.listen(window, "pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top, moved: true };
    });
    this.listen(window, "pointerdown", (e) => {
      if (e.pointerType === "touch") return this.setDevice("touch");
      if (e.target !== canvas) return; // clicks on the HTML UI are not attacks
      this.press(`Mouse${e.button}`);
      this.setDevice("keyboard");
    });
    this.listen(window, "pointerup", (e) => {
      if (e.pointerType === "mouse") this.down.delete(`Mouse${e.button}`);
    });
    this.listen(window, "contextmenu", (e) => {
      if (e.target === canvas) e.preventDefault();
    });
  }

  /** Screen position (CSS px) of the local player, to turn the mouse position into an aim vector. */
  setAimOrigin(x: number, y: number) {
    this.aimOrigin = { x, y };
  }

  /** Builds the Intent for one simulation step and clears consumed presses. */
  sample(): Intent {
    const keys = useSettings.getState().keys;
    const held = new Set<Action>();
    for (const a of ACTIONS) if (keys[a].some((b) => this.down.has(b))) held.add(a);

    const dir = (d: MoveDir) => (keys[d].some((b) => this.down.has(b)) ? 1 : 0);
    let move: Vec2 = normalize({ x: dir("right") - dir("left"), y: dir("down") - dir("up") });
    let aim: Intent["aim"] = null;
    if (this.mouse.moved && useInputDevice.getState().device === "keyboard")
      aim = normalize({ x: this.mouse.x - this.aimOrigin.x, y: this.mouse.y - this.aimOrigin.y });

    const pad = this.pollGamepad(held);
    if (pad?.move) move = pad.move;
    if (pad?.aim) aim = pad.aim;

    if (touchInput.active) {
      if (touchInput.move.x || touchInput.move.y) move = clampLength(touchInput.move, 1);
      if (touchInput.aim) aim = touchInput.aim;
      touchInput.held.forEach((a) => held.add(a));
      touchInput.pressedQueue.splice(0).forEach((a) => this.latched.add(a));
    }

    const pressed = [...this.latched];
    this.latched.clear();
    return { move, aim, held: [...held], pressed };
  }

  /**
   * Forgets pending presses and treats currently held keys/buttons as already pressed. Called when
   * gameplay resumes after a menu, so the key that closed the menu doesn't act in game.
   */
  flush() {
    this.latched.clear();
    touchInput.pressedQueue.length = 0;
    const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === "standard");
    this.padPrev = new Set();
    if (pad) for (const [action, buttons] of Object.entries(PAD) as [Action, number[]][]) if (buttons.some((b) => pad.buttons[b]?.pressed)) this.padPrev.add(action);
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }

  private listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void) {
    target.addEventListener(type, fn);
    this.disposers.push(() => target.removeEventListener(type, fn));
  }

  private press(binding: Binding) {
    this.down.add(binding);
    const keys = useSettings.getState().keys;
    for (const a of ACTIONS) if (keys[a].includes(binding)) this.latched.add(a);
  }

  private isBound(code: string) {
    return Object.values(useSettings.getState().keys).some((list) => list.includes(code));
  }

  private pollGamepad(held: Set<Action>): { move?: Vec2; aim?: Vec2 } | null {
    const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === "standard");
    if (!pad) return null;
    const axis = (i: number) => pad.axes[i] ?? 0;
    const stick = (x: number, y: number) => (Math.hypot(x, y) > STICK_DEADZONE ? clampLength({ x, y }, 1) : null);
    const button = (i: number) => pad.buttons[i]?.pressed ?? false;

    const now = new Set<Action>();
    for (const [action, buttons] of Object.entries(PAD) as [Action, number[]][]) if (buttons.some(button)) now.add(action);
    for (const a of now) {
      held.add(a);
      if (!this.padPrev.has(a)) this.latched.add(a);
    }
    this.padPrev = now;

    const move = stick(axis(0), axis(1));
    const aim = stick(axis(2), axis(3));
    const dpad = { x: (button(15) ? 1 : 0) - (button(14) ? 1 : 0), y: button(13) ? 1 : 0 };
    if (move || aim || now.size || dpad.x || dpad.y) this.setDevice("gamepad");
    return {
      move: move ?? (dpad.x || dpad.y ? normalize(dpad) : undefined),
      aim: aim ? normalize(aim) : undefined,
    };
  }

  private setDevice(device: InputDevice) {
    useInputDevice.getState().setDevice(device);
  }
}
