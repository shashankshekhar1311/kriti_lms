import {loadFont as loadFredoka} from '@remotion/google-fonts/Fredoka';
import {loadFont as loadNunito} from '@remotion/google-fonts/Nunito';

export const {fontFamily: displayFont} = loadFredoka('normal', {
  weights: ['500', '600', '700'],
  subsets: ['latin'],
});

export const {fontFamily: bodyFont} = loadNunito('normal', {
  weights: ['600', '700', '800', '900'],
  subsets: ['latin'],
});
