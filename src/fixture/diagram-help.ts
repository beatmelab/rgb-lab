import { GamutDiagram, diagramPosition } from './diagram.ts';
import { hexToXYZ, xyzToXy } from './colorimetry.ts';
import { fixtureGamut, fullLevels, mixFixture } from './engine.ts';
import { FIXTURE_PROFILES } from './profiles.ts';

/** A fixed, annotated RGB example using the same CIE data and renderer as the
 * controls. It never reads or changes the learner's current mix.
 */
export function drawDiagramHelp(canvas: HTMLCanvasElement): void {
  const profile = FIXTURE_PROFILES[0], target = hexToXYZ('#FFFFFF')!;
  const actual = mixFixture(profile,fullLevels(profile),target).xy!;
  const diagram = new GamutDiagram(canvas,undefined,4);
  diagram.draw(fixtureGamut(profile),xyzToXy(target),actual,profile.emitters);
  const context = canvas.getContext('2d')!;
  const badge = (number: number, x: number, y: number, color: string, destination?: readonly [number,number], dashed = false): void => {
    context.save();
    if (destination) {
      context.strokeStyle = color; context.lineWidth = 1;
      if (dashed) context.setLineDash([3,2]);
      context.beginPath(); context.moveTo(x,y); context.lineTo(...destination); context.stroke();
      context.setLineDash([]);
    }
    context.beginPath(); context.arc(x,y,9,0,Math.PI*2);
    context.fillStyle = '#111417'; context.fill(); context.strokeStyle = color; context.lineWidth = 1.3; context.stroke();
    context.font = '600 10px "DM Sans", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = '#fff'; context.fillText(String(number),x,y+.5);
    context.restore();
  };
  badge(1,64,54,'#c7cbd1');
  badge(2,260,108,'#b5ed8a',diagramPosition({x:.55,y:.417}));
  badge(3,67,145,'#e6e8f0',diagramPosition({x:.23,y:.348}),true);
  const a = diagramPosition(xyzToXy(target)!), b = diagramPosition(actual);
  badge(4,177,202,'#d4d7dd',[(a[0]+b[0])/2,(a[1]+b[1])/2]);
  diagram.destroy();
}
