import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { normalizeCode } from './crypto/wichtel-crypto';

describe('App', () => {
  beforeEach(async () => {
    history.replaceState(null, '', '/');
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('zeigt einen Hinweis, wenn der Code im Link fehlt', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Wen beschenkst du?');
    expect(el.textContent).toContain('Hier fehlt dein persönlicher Code.');
  });
});

describe('normalizeCode', () => {
  it('entfernt #, Leerzeichen und Bindestriche und wandelt in Großbuchstaben', () => {
    expect(normalizeCode('#abcd-ef23 45%20gh')).toBe('ABCDEF2345GH');
  });
});
