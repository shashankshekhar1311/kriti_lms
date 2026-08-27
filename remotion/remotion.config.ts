/**
 * Remotion CLI config. Node APIs ignore this file — pass options to those APIs directly.
 * https://www.remotion.dev/docs/config
 */
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setDelayRenderTimeoutInMilliseconds(120000);

const browserExecutable =
  process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
if (browserExecutable) {
  Config.setBrowserExecutable(browserExecutable);
  Config.setChromiumOpenGlRenderer('angle');
}
