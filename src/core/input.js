export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.mouseLeftUp = false;
    this.mouseRightUp = false;

    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.justDown.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.justUp.add(e.code);
    });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      e.preventDefault();
      if (e.button === 0) { this.mouseLeft = true; this.mouseLeftDown = true; }
      if (e.button === 2) { this.mouseRight = true; this.mouseRightDown = true; }
    });
    canvas.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouseLeft = false; this.mouseLeftUp = true; }
      if (e.button === 2) { this.mouseRight = false; this.mouseRightUp = true; }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  held(code) { return this.keys.has(code); }
  pressed(code) { return this.justDown.has(code); }
  released(code) { return this.justUp.has(code); }

  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.mouseLeftUp = false;
    this.mouseRightUp = false;
  }
}
