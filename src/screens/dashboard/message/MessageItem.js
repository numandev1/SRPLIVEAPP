import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import MessageBubble from '../../../components/MessageBubble';

//Redux
import {connect} from 'react-redux';
import moment from 'moment';

class MessageItem extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {};
  }

  renderDay() {
    if (this.props.currentMessage && this.props.currentMessage.time) {
      const {...props} = this.props;
      // if (this.props.renderDay) {
      //   return this.props.renderDay(props);
      // }
      let Todaydate = moment().format('L');
      let currentDate = moment(this.props.currentMessage.time).format('L');
      let yesterday = moment(this.props.currentMessage.time)
        .subtract('days')
        .calendar()
        .split(' at ')[0];
      // console.log('today date',yesterday)
      return (
        <>
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 7,
              elevation: 1,
              paddingHorizontal: 15,
              paddingVertical: 8,
              top: 0,
              alignSelf: 'center',
              marginVertical: '2%',
            }}>
            <Text style={{fontWeight: '600', fontSize: 12, color: 'grey'}}>
              {yesterday}
            </Text>
          </View>
        </>
      );
    }
    return null;
  }

  handleScroll = event => {
    console.log(event);
  };
  render() {
    const {
      currentMessage,
      position,
      longPress,
      nextMessage,
      previousMessage,
      keywords,
    } = this.props;

    let selctedMessageColor = null;

    if (longPress.length !== 0) {
      selctedMessageColor = longPress?.find(x => x.id === currentMessage.id);
    }
    let currentDate = moment(this.props.currentMessage.time).format('L');
    let previousDate = moment(previousMessage.time).format('L');
    return (
      <>
        {currentDate !== previousDate && this.renderDay()}
        <View
          style={[
            styles[position].container,
            selctedMessageColor === null || selctedMessageColor === undefined
              ? {backgroundColor: this.props.backgroundColor}
              : {
                  backgroundColor: '#C2DBDF',
                  borderRadius: 5,
                },
          ]}>
          <MessageBubble
            currentMessage={currentMessage}
            position={position}
            navProps={this.props.navProps}
            isEdited={this.props.isEdited}
            keywords={keywords}
          />
        </View>
      </>
    );
  }
}

const styles = {
  left: StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      paddingLeft: 8,
      marginRight: 0,
      marginVertical: '1%',
    },
  }),
  right: StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      marginLeft: 0,
      paddingRight: 8,
      marginVertical: '1%',
      marginBottom: '0.5%',
    },
  }),
};

const mapStateToProps = state => {
  return {
    longPress: state.messages.longPress,
  };
};

const mapDispatchToProps = dispatch => {
  return {};
};

export default connect(mapStateToProps, mapDispatchToProps)(MessageItem);
