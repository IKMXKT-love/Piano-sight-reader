import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pianosightreader.app',
  appName: 'Piano Sight Reader',
  webDir: 'dist',
  // 原生插件配置预留区
  plugins: {
    // 麦克风权限将通过 @capacitor/microphone 或原生插件处理
    // 在此处添加插件特定配置
  },
};

export default config;
