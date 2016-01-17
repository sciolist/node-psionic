// importing the browser bundle exposes a 'Harpy' global
// import '../../dist/harpy.min.js';

import harpy from '../..'; // import harpy from 'harpy';
import React from 'react';
import ReactDOM from 'react-dom';

class App extends React.Component {
  async componentWillMount() { await this.search(); }
  setPage(page) { this.setState({ page }); }
  setSort(sort) { this.setState({ sort, page: 0 }); }

  async search() {
    let state = this.state || { };
    let results = await this.props.client.Nominations.query({
      page: state.page,
      sort: state.sort
    });
    this.setState({ results });
  }

  async componentDidUpdate(prevProps, prevState) {
    if (prevState && (
      (prevState.page !== this.state.page) ||
      (prevState.sort !== this.state.sort)
    )) {
      await this.search();
    }
  }

  render() {
    if (!this.state) return <div />;
    let page = this.state.results.page, max = this.state.results.totalPages;
    let prevPage = <li onClick={e => this.setPage(page - 1)} className="previous"><a>Back</a></li>;
    let nextPage = <li onClick={e => this.setPage(page + 1)} className="next"><a>Next</a></li>;

    return <div className="container">
      <ul className="pager">
        { page > 0 && prevPage }
        <span>Page {page + 1} of {max + 1}</span>
        { page < max && nextPage }
      </ul>
      <table className="table table-bordered table-striped">
        <thead>
          <tr>
            <th onClick={e => this.setSort('name')}>Name</th>
            <th onClick={e => this.setSort('position_title')}>Position</th>
            <th onClick={e => this.setSort('agency_name')}>Agency</th>
          </tr>
        </thead>
        <tbody>
        {this.state.results.items.map(p => (
          <tr key={p[':sid']}>
            <td className="col-sm-4">{p.name}</td>
            <td className="col-sm-4">{p.position_title}</td>
            <td className="col-sm-4">{p.agency_name}</td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  }
}

(async function run() {
  let client = await harpy.webSocket.connect('ws://' + location.host, {
    describe: { token: 'hello' }
  });
  ReactDOM.render(<App client={client} />, document.getElementById('root'));
})()
.catch(ex => console.error(ex.stack));
