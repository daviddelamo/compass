const _ = require('lodash');
const format = require('util').format;
const React = require('react');
const openIndexHelpLink = require('../index-link-helper');

/**
 * Component for the type column.
 */
class TypeColumn extends React.Component {

  _clickHelp(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    openIndexHelpLink(evt.target.parentNode.innerText);
  }

  _link() {
    return (<i className="link" onClick={this._clickHelp.bind(this)} />);
  }

  _textTooltip() {
    const info = _.pick(this.props.index.extra, ['weights', 'default_language', 'language_override']);
    return _.map(info, (v, k) => {
      return format('%s: %j', k, v);
    }).join('\n');
  }

  /**
   * Render the type div.
   *
   * @returns {React.Component} The type div.
   */
  renderType() {
    if (this.props.index.type === 'text') {
      return (
        <div className={`property ${this.props.index.type}`} title={this._textTooltip()}>
          {this.props.index.type}
          {this._link()}
        </div>
      );
    }
    return (
      <div className={`property ${this.props.index.type}`}>
        {this.props.index.type}
        {this._link()}
      </div>
    );
  }

  /**
   * Render the type column.
   *
   * @returns {React.Component} The type column.
   */
  render() {
    return (
      <td className="type-column">
        {this.renderType()}
      </td>
    );
  }
}

TypeColumn.displayType = 'TypeColumn';

TypeColumn.propTypes = {
  index: React.PropTypes.object.isRequired
};

module.exports = TypeColumn;