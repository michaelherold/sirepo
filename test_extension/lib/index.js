import { ILauncher } from '@jupyterlab/launcher';
import { LabIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';
import slackIconStr from '../../sirepo/package_data/static/svg/slack.svg';

const icon = new LabIcon({
  name: 'launcher:slack-icon',
  svgstr: slackIconStr,
  id: 'icon-id'
});

class ExampleWidget extends Widget {
  constructor() {
    super();
    this.addClass('slack-icon');
    this.id = 'simple-widget-example';
    this.title.icon = icon;
  }
}

export default [
  {
    id: 'test_extension',
    autoStart: true,
    requires: [ILauncher],
    activate: function (app, launcher) {


      const { commands, shell } = app;

      const command = 'jlab-examples:slack-launcher';


      commands.addCommand(command, {
        label: 'Sirepo Slack',
        caption: 'Execute jlab-examples:slack-launcher Command',
        icon,
        execute: (args) => {
          console.log('app.shell', app.shell);
          // window.location.assign("http://www.slack.com");
        },
      });





      launcher.add({
        command,
        category: 'Other',
        rank: 1,
      });



      const widget = new ExampleWidget();
      var n = document.createElement('div');
      n.innerHTML = '<div id="slack-widget" onclick="console.log(2)"> hello </div> ';
      widget.node = n;
      widget.id = 'simple-widget-example';
      console.log('widget.node: ', widget.node);
      shell.add(widget, 'left');



    },
  }
];
