module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'CorretorSimulados',
    appBundleId: 'br.com.luma.corretorsimulados',
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'CorretorSimulados',
        authors: 'Luma',
        description: 'Aplicativo local para criação, impressão e correção de simulados.',
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
