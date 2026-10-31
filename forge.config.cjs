module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'CorretorSimulados',
    appBundleId: 'br.com.luma.corretorsimulados',
    // Ícone do executável (Windows usa build/icon.ico; macOS, build/icon.icns se houver)
    icon: './build/icon',
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'CorretorSimulados',
        authors: 'Luma',
        description: 'Aplicativo local para criação, impressão e correção de simulados.',
        // Ícone do instalador e de "Aplicativos instalados" no Windows
        setupIcon: './build/icon.ico',
        iconUrl: 'https://raw.githubusercontent.com/gustavoverneck/corretor-simulado/main/build/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {},
    },
  ],
}
