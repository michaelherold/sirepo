
// import {
//   JupyterFrontEnd,
//   JupyterFrontEndPlugin,
// } from '@jupyterlab/application';

// import { ICommandPalette } from '@jupyterlab/apputils';

export default [
  {
    id: 'test_extension',
    autoStart: true,
    // requires: [ICommandPalette],
    activate: function (app, palette) {
      console.log(
        'Menu Extension'
      );
      console.log(app.commands);
      const { commands } = app;
      const command = 'jlab-examples:main-menu';
      commands.addCommand(command, {
        label: 'Open Sirepo Slack for Help',
        caption: 'Execute jlab-examples:main-menu Command',
        execute: (args) => {
          console.log(
            `jlab-examples:main-menu has been called ${args['origin']}.`
          );
          window.location.assign("http://www.slack.com");
        },
      });

      // Add the command to the command palette
      // const category = 'Extension Examples';
      // palette.addItem({
      //   command,
      //   category,
      //   args: { origin: 'from the palette' },
      // });
    },
    }
];


// import {
//   JupyterFrontEnd,
//   JupyterFrontEndPlugin,
// } from '@jupyterlab/application';

// import { ICommandPalette } from '@jupyterlab/apputils';

// /**
//  * Initialization data for the main menu example.
//  */
// const extension: JupyterFrontEndPlugin<void> = {
//   id: 'main-menu',
//   autoStart: true,
//   requires: [ICommandPalette],
//   activate: (app: JupyterFrontEnd, palette: ICommandPalette) => {
//     const { commands } = app;

//     // Add a command
//     const command = 'jlab-examples:main-menu';
//     commands.addCommand(command, {
//       label: 'Execute jlab-examples:main-menu Command',
//       caption: 'Execute jlab-examples:main-menu Command',
//       execute: (args: any) => {
//         console.log(
//           `jlab-examples:main-menu has been called ${args['origin']}.`
//         );
//         window.alert(
//           `jlab-examples:main-menu has been called ${args['origin']}.`
//         );
//       },
//     });

//     // Add the command to the command palette
//     const category = 'Extension Examples';
//     palette.addItem({
//       command,
//       category,
//       args: { origin: 'from the palette' },
//     });
//   },
// };

// export default extension;