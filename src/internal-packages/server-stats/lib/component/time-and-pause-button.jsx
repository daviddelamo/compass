const React = require('react');
const Actions = require('../action');
const ServerStatsStore = require('../store/server-stats-graphs-store');

class TimeAndPauseButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      paused: ServerStatsStore.isPaused
    };
  }

  handlePause() {
    this.setState({
      paused: !this.state.paused
    });
    Actions.pause();
  }

  render() {
    return (
      <div className="time-and-pause">
        <div className="time"><text className="currentTime">00:00:00</text></div>
        <div onClick={this.handlePause.bind(this)} className="play" style={{display: this.state.paused ? null : 'none'}}><text className="playbutton"><i className="fa fa-play"></i>PLAY</text></div>
        <div onClick={this.handlePause.bind(this)} className="pause" style={{display: this.state.paused ? 'none' : null}}><text className="pausebutton"><i className="fa fa-pause"></i>PAUSE</text></div>
      </div>
    );
  }
}

TimeAndPauseButton.propTypes = {
  paused: React.PropTypes.bool.isRequired
};

TimeAndPauseButton.defaultProps = {
  paused: false
};

TimeAndPauseButton.displayName = 'TimeAndPauseButton';

module.exports = TimeAndPauseButton;