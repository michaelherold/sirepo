import { ILauncher } from '@jupyterlab/launcher';
import { LabIcon } from '@jupyterlab/ui-components';
import slackIconStr from '../../sirepo/package_data/static/svg/slack.svg';

export default [
  {
    id: 'test_extension',
    autoStart: true,
    requires: [ILauncher],
    activate: function (app, launcher) {

      console.log(app.commands);
      const { commands } = app;

      const command = 'jlab-examples:slack-launcher';
      const icon = new LabIcon({
        name: 'launcher:slack-icon',
        svgstr: slackIconStr,
      });

      commands.addCommand(command, {
        label: 'Sirepo Slack',
        caption: 'Execute jlab-examples:slack-launcher Command',
        icon,
        execute: (args) => {
          console.log(
            `jlab-examples:slack-launcher has been called ${args['origin']}.`
          );
          window.location.assign("http://www.slack.com");
        },
      });

      launcher.add({
        command,
        category: 'Other',
        rank: 1,
      });
    },
  }
];
