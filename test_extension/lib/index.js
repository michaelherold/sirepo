import { ILauncher } from '@jupyterlab/launcher';
import { LabIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';
import slackIconStr from '../../sirepo/package_data/static/svg/slack.svg';


console.log(slackIconStr);

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
          window.location.assign("http://www.slack.com");
        },
      });





      launcher.add({
        command,
        category: 'Other',
        rank: 1,
      });



      const widget = new ExampleWidget();
      // var newNode = Object.assign(document.createElement('a'), {onclick: () => {
      //   window.location.assign("http://www.slack.com");
      // }});


      // // widget.node = `<div id="${widget.id}"> xxx ${widget.node} xxx</div>`
      // // widget.id = 'poop';
      // newNode.id = 'poop';
      // widget.node = newNode;
      // console.log('widget.node:', widget.node);
      // console.log('global icon:', icon);
      // console.log('widget.title.icon:', widget.title.icon);
      // console.log('parent:', widget.node.parentElement);
      shell.add(widget, 'left');



    },
  }
];
